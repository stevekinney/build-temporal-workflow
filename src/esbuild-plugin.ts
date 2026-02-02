/**
 * esbuild plugin for Temporal workflow bundling.
 *
 * Handles:
 * - Module resolution for allowed builtins (assert, url, util)
 * - Converter aliasing (__temporal_custom_payload_converter$, etc.)
 * - Forbidden module detection and blocking
 * - OpenTelemetry module replacement
 * - Ignored modules (with runtime-throwing stubs)
 * - Import type detection to reduce false positives
 */

import { readFileSync } from 'node:fs';
import { builtinModules } from 'node:module';

import type * as esbuild from 'esbuild';

import {
  getModuleOverridePath,
  isAllowedBuiltin,
  isForbidden,
  loadDeterminismPolicy,
  normalizeSpecifier,
} from './policy';
import type { DeterminismPolicy } from './types';

/**
 * Create a regex pattern that matches all Node.js builtin modules.
 * Matches both bare names (fs) and node: prefixed (node:fs), plus subpaths.
 */
function createBuiltinPattern(): RegExp {
  // Escape special regex characters in module names
  const escaped = builtinModules.map((m) => m.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  return new RegExp(`^(node:)?(${escaped.join('|')})(/.*)?$`);
}

/**
 * Pre-computed builtin pattern at module load time.
 * This pattern is deterministic and doesn't need to be regenerated per build.
 */
const BUILTIN_PATTERN = createBuiltinPattern();

export interface TemporalPluginOptions {
  /**
   * Modules to ignore (will throw at runtime if used)
   */
  ignoreModules: string[];

  /**
   * Path to custom payload converter
   */
  payloadConverterPath?: string | undefined;

  /**
   * Path to custom failure converter
   */
  failureConverterPath?: string | undefined;

  /**
   * The determinism policy to use
   */
  policy?: DeterminismPolicy | undefined;
}

/**
 * State object returned by createTemporalPlugin for post-build validation.
 */
export interface TemporalPluginState {
  /**
   * Map of forbidden modules found -> importer path
   */
  foundProblematicModules: Map<string, string>;

  /**
   * Map of forbidden modules imported transitively from node_modules -> importer path.
   * These are warnings, not errors, since they are unlikely to be reached at runtime.
   */
  transitiveForbiddenModules: Map<string, string>;

  /**
   * List of files with dynamic imports (break replay determinism)
   */
  dynamicImports: Array<{ file: string; line: number; column: number }>;
}

/**
 * Result of createTemporalPlugin.
 */
export interface TemporalPluginResult {
  plugin: esbuild.Plugin;
  state: TemporalPluginState;
}

/**
 * Check if a module matches any in the ignore list.
 */
function isIgnored(module: string, ignoreModules: string[]): boolean {
  const normalized = normalizeSpecifier(module);
  return ignoreModules.some((m) => normalized === m || normalized.startsWith(`${m}/`));
}

/**
 * Check if an import is type-only.
 *
 * Type-only imports are allowed even for forbidden modules because they're
 * erased at compile time and don't affect runtime behavior.
 *
 * Patterns detected:
 * - import type { Foo } from 'module'
 * - import { type Foo } from 'module'
 * - import type * as Mod from 'module'
 *
 * This function reads the importer file and checks if the specific import
 * statement is type-only.
 */
/**
 * Cache for compiled regex patterns keyed by escaped module path.
 */
const typeImportPatternCache = new Map<string, RegExp>();
const namedImportPatternCache = new Map<string, RegExp>();
const valueImportPatternCache = new Map<string, RegExp>();
const requirePatternCache = new Map<string, RegExp>();

function getOrCreatePattern(
  cache: Map<string, RegExp>,
  key: string,
  factory: () => RegExp,
): RegExp {
  let pattern = cache.get(key);
  if (!pattern) {
    pattern = factory();
    cache.set(key, pattern);
  }
  return pattern;
}

function isTypeOnlyImport(
  modulePath: string,
  importerPath: string,
  importerContentsCache: Map<string, string>,
): boolean {
  // Skip non-TypeScript files
  if (!importerPath.match(/\.[mc]?tsx?$/)) {
    return false;
  }

  try {
    let contents = importerContentsCache.get(importerPath);
    if (!contents) {
      contents = readFileSync(importerPath, 'utf-8');
      importerContentsCache.set(importerPath, contents);
    }

    // Escape the module path for regex
    const escapedPath = modulePath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

    // Pattern 1: import type { ... } from 'module'
    // Pattern 2: import type * as Name from 'module'
    const typeImportPattern = getOrCreatePattern(
      typeImportPatternCache,
      escapedPath,
      () =>
        new RegExp(
          `import\\s+type\\s+(?:\\{[^}]*\\}|\\*\\s+as\\s+\\w+)\\s+from\\s+['"]${escapedPath}['"]`,
        ),
    );

    // Pattern 3: import { type Foo, type Bar } from 'module'
    // This needs to check if ALL imports are type-only
    const namedImportPattern = getOrCreatePattern(
      namedImportPatternCache,
      escapedPath,
      () => new RegExp(`import\\s+\\{([^}]*)\\}\\s+from\\s+['"]${escapedPath}['"]`, 'g'),
    );
    // Reset lastIndex for global regex reuse
    namedImportPattern.lastIndex = 0;

    // Check for explicit type import
    if (typeImportPattern.test(contents)) {
      return true;
    }

    // Check named imports - if all are type-prefixed, it's type-only
    let match;
    while ((match = namedImportPattern.exec(contents)) !== null) {
      const imports = match[1]!;

      // Split by comma and check each import
      const importNames = imports
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);

      // If empty (import {} from 'x'), skip
      if (importNames.length === 0) {
        continue;
      }

      // Check if all imports are type-prefixed
      const allTypePrefixed = importNames.every((imp) => {
        // Handle: type Foo, type Foo as Bar
        return imp.startsWith('type ') || imp.startsWith('type\t');
      });

      if (!allTypePrefixed) {
        // Found a value import
        return false;
      }
    }

    // If we found type imports but no value imports, it's type-only
    // However, if we found nothing, be conservative and return false
    if (typeImportPattern.test(contents)) {
      return true;
    }

    // Check for any non-type import of this module
    const valueImportPattern = getOrCreatePattern(
      valueImportPatternCache,
      escapedPath,
      () => new RegExp(`import\\s+(?!type\\s)[^'"]*['"]${escapedPath}['"]`),
    );

    // Also check for require() calls
    const requirePattern = getOrCreatePattern(
      requirePatternCache,
      escapedPath,
      () => new RegExp(`require\\s*\\(\\s*['"]${escapedPath}['"]\\s*\\)`),
    );

    if (requirePattern.test(contents)) {
      return false;
    }

    if (valueImportPattern.test(contents)) {
      // Found a value import - check if it's actually type-only with inline type
      const lines = contents.split('\n');
      for (const line of lines) {
        if (line.includes(modulePath) && line.includes('import')) {
          // Skip lines that are clearly type-only
          if (line.match(/import\s+type\s/)) {
            continue;
          }

          // Check for inline type imports
          const inlineMatch = line.match(/import\s+\{([^}]*)\}/);
          if (inlineMatch) {
            const imports = inlineMatch[1]!
              .split(',')
              .map((s) => s.trim())
              .filter(Boolean);
            const hasValueImport = imports.some(
              (imp) => !imp.startsWith('type ') && !imp.startsWith('type\t'),
            );
            if (hasValueImport) {
              return false;
            }
          } else {
            // Non-destructuring import of a forbidden module
            return false;
          }
        }
      }
    }

    // Default to type-only if we only found type imports
    return typeImportPattern.test(contents);
  } catch {
    // If we can't read the file, be conservative
    return false;
  }
}

/**
 * Infer the esbuild loader from a file extension.
 */
function inferLoader(filePath: string): esbuild.Loader {
  const ext = filePath.slice(filePath.lastIndexOf('.'));
  switch (ext) {
    case '.ts':
    case '.mts':
    case '.cts':
      return 'ts';
    case '.tsx':
      return 'tsx';
    case '.jsx':
      return 'jsx';
    case '.mjs':
    case '.cjs':
    case '.js':
    default:
      return 'js';
  }
}

/**
 * Create the Temporal workflow esbuild plugin.
 * Returns both the plugin and a state object for post-build validation.
 */
export function createTemporalPlugin(
  options: TemporalPluginOptions,
): TemporalPluginResult {
  const { ignoreModules, payloadConverterPath, failureConverterPath } = options;
  const policy = options.policy ?? loadDeterminismPolicy();

  // Shared state for post-build validation
  const state: TemporalPluginState = {
    foundProblematicModules: new Map(),
    transitiveForbiddenModules: new Map(),
    dynamicImports: [],
  };

  // Cache for importer file contents (for type-only import detection)
  const importerContentsCache = new Map<string, string>();

  const plugin: esbuild.Plugin = {
    name: 'temporal-workflow',
    setup(build) {
      // Reference to shared state
      const foundProblematicModules = state.foundProblematicModules;

      // ============================================================
      // 1. Handle ALL Node.js builtins with a single handler
      // This ensures we intercept them before esbuild's default handling
      // ============================================================
      build.onResolve({ filter: BUILTIN_PATTERN }, (args) => {
        const normalized = normalizeSpecifier(args.path);
        const baseName = normalized.split('/')[0] ?? normalized;

        // Allowed builtins get Temporal's stubs
        if (isAllowedBuiltin(baseName)) {
          try {
            const stubPath = getModuleOverridePath(baseName);
            return { path: stubPath };
          } catch {
            // Fall through if stub not found
          }
        }

        // Check if ignored
        if (isIgnored(normalized, ignoreModules)) {
          return {
            path: normalized,
            namespace: 'temporal-ignored',
          };
        }

        // Check if this is a type-only import (allowed for forbidden modules)
        if (
          args.importer &&
          isTypeOnlyImport(args.path, args.importer, importerContentsCache)
        ) {
          // Type-only imports are erased at compile time, so they're safe
          return {
            path: normalized,
            namespace: 'temporal-type-only',
          };
        }

        // Forbidden builtin - record and return stub
        const importer = args.importer || 'unknown';
        if (
          importer.includes('/node_modules/') ||
          importer.includes('\\node_modules\\')
        ) {
          state.transitiveForbiddenModules.set(normalized, importer);
        } else {
          foundProblematicModules.set(normalized, importer);
        }
        return {
          path: normalized,
          namespace: 'temporal-forbidden',
        };
      });

      // ============================================================
      // 2. Handle converter aliases
      // ============================================================
      build.onResolve({ filter: /^__temporal_custom_payload_converter\$$/ }, () => {
        if (payloadConverterPath) {
          return { path: payloadConverterPath };
        }
        // No converter provided - resolve to stub
        return {
          path: '__temporal_custom_payload_converter$',
          namespace: 'temporal-converter-stub',
        };
      });

      build.onResolve({ filter: /^__temporal_custom_failure_converter\$$/ }, () => {
        if (failureConverterPath) {
          return { path: failureConverterPath };
        }
        // No converter provided - resolve to stub
        return {
          path: '__temporal_custom_failure_converter$',
          namespace: 'temporal-converter-stub',
        };
      });

      // Stub for missing converters
      build.onLoad({ filter: /.*/, namespace: 'temporal-converter-stub' }, () => ({
        contents:
          'module.exports = { payloadConverter: undefined, failureConverter: undefined };',
        loader: 'js',
      }));

      // ============================================================
      // 3. OpenTelemetry workflow imports replacement
      // The interceptors-opentelemetry package uses a stub module that errors
      // when @temporalio/workflow isn't available. In the bundle context,
      // we replace it with the real implementation.
      // ============================================================
      build.onResolve(
        {
          filter:
            /[\\/](?:@temporalio|packages)[\\/]interceptors-opentelemetry[\\/](?:src|lib)[\\/]workflow[\\/]workflow-imports\.[jt]s$/,
        },
        (args) => {
          // Replace stub with actual implementation (sibling file in same directory)
          const implPath = args.path.replace(
            /workflow-imports\.[jt]s$/,
            'workflow-imports-impl.js',
          );
          return { path: implPath };
        },
      );

      // ============================================================
      // 4. Handle ignored and forbidden non-builtin modules
      // Builtins are handled above; this catches packages like @temporalio/activity
      // ============================================================
      build.onResolve({ filter: /.*/ }, (args) => {
        const normalized = normalizeSpecifier(args.path);

        // Note: Builtins are already handled by BUILTIN_PATTERN handler above.
        // The builtin pattern handler runs first and handles all node: and bare builtin
        // module specifiers, so we don't need to re-check isAllowedBuiltin here.

        // Check if this is an ignored module - return stub that throws at runtime
        if (isIgnored(normalized, ignoreModules)) {
          return {
            path: normalized,
            namespace: 'temporal-ignored',
          };
        }

        // Check against forbidden list
        if (isForbidden(normalized, policy)) {
          // Check if this is a type-only import (allowed for forbidden modules)
          if (
            args.importer &&
            isTypeOnlyImport(args.path, args.importer, importerContentsCache)
          ) {
            // Type-only imports are erased at compile time, so they're safe
            return {
              path: normalized,
              namespace: 'temporal-type-only',
            };
          }

          // Record for error reporting and return a stub to prevent esbuild errors
          const importer = args.importer || 'unknown';
          if (
            importer.includes('/node_modules/') ||
            importer.includes('\\node_modules\\')
          ) {
            state.transitiveForbiddenModules.set(normalized, importer);
          } else {
            foundProblematicModules.set(normalized, importer);
          }
          return {
            path: normalized,
            namespace: 'temporal-forbidden',
          };
        }

        return null;
      });

      build.onLoad({ filter: /.*/, namespace: 'temporal-ignored' }, (args) => ({
        contents: `
          throw new Error(
            'Module "${args.path}" was ignored during bundling but was executed at runtime. ' +
            'This indicates the module is actually used in workflow code. ' +
            "Move this usage to an Activity or remove it from 'ignoreModules'."
          );
        `,
        loader: 'js',
      }));

      // Type-only imports are erased at compile time, so we return an empty module
      // This is safe because TypeScript only uses these imports for type checking
      build.onLoad({ filter: /.*/, namespace: 'temporal-type-only' }, () => ({
        contents: '// Type-only import - erased at compile time',
        loader: 'js',
      }));

      // Stub for forbidden modules - the bundler will check state.foundProblematicModules
      // after the build and throw a proper error
      build.onLoad({ filter: /.*/, namespace: 'temporal-forbidden' }, (args) => ({
        contents: `
          throw new Error(
            'Module "${args.path}" is forbidden in workflow code as it may break determinism.'
          );
        `,
        loader: 'js',
      }));

      // ============================================================
      // 5. Detect dynamic imports (import() expressions)
      // Dynamic imports break workflow determinism because the module
      // resolved at runtime may differ between original and replay.
      // ============================================================
      build.onLoad({ filter: /\.[mc]?[jt]sx?$/ }, (args) => {
        // Skip node_modules - we only care about user workflow code
        // This significantly improves performance by avoiding scanning dependencies
        if (args.path.includes('node_modules')) {
          return undefined;
        }

        // Read file contents (may already be cached)
        let contents = importerContentsCache.get(args.path);
        if (!contents) {
          contents = readFileSync(args.path, 'utf-8');
          importerContentsCache.set(args.path, contents);
        }

        // Check for dynamic import() expressions
        // Pattern matches: import(...) but not import type or import from
        const dynamicImportPattern = /\bimport\s*\(\s*[^)]+\s*\)/g;

        let match;
        while ((match = dynamicImportPattern.exec(contents)) !== null) {
          // Skip if this is inside a comment
          const beforeMatch = contents.slice(0, match.index);
          const lastNewline = beforeMatch.lastIndexOf('\n');
          const linePrefix = beforeMatch.slice(lastNewline + 1);

          // Skip single-line comments
          if (linePrefix.includes('//')) {
            continue;
          }

          // Skip multi-line comments (simplified)
          const lastBlockOpen = beforeMatch.lastIndexOf('/*');
          const lastBlockClose = beforeMatch.lastIndexOf('*/');
          if (lastBlockOpen > lastBlockClose) {
            continue;
          }

          // Calculate line and column
          const lines = beforeMatch.split('\n');
          const line = lines.length;
          const column = (lines[lines.length - 1]?.length ?? 0) + 1;

          state.dynamicImports.push({
            file: args.path,
            line,
            column,
          });
        }

        // Return the cached contents to avoid esbuild re-reading the file
        const loader = inferLoader(args.path);
        return { contents, loader };
      });

      // ============================================================
      // 6. Clean up cache after build to free memory
      // ============================================================
      build.onEnd(() => {
        importerContentsCache.clear();
      });

      // Note: We don't throw in onEnd because esbuild wraps the error and loses type info.
      // Instead, the bundler checks state.foundProblematicModules after the build.
    },
  };

  return { plugin, state };
}
