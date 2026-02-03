/**
 * Cross-runtime input support for Deno and Bun-flavored TypeScript.
 *
 * Handles:
 * - Input flavor detection (node, deno, bun, auto)
 * - Import map parsing (deno.json, import_map.json)
 * - npm: specifier translation
 * - URL import fetching and caching
 * - Runtime-specific API detection
 */

import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

import type * as esbuild from 'esbuild';

import type { CrossRuntimeConfig, ImportMap, InputFlavor, UrlImportCache } from './types';

/**
 * Default cache directory for URL imports.
 */
const DEFAULT_CACHE_DIR = 'node_modules/.cache/temporal-bundler/url-imports';

/**
 * Deno-specific APIs that are forbidden in workflow code.
 */
const DENO_FORBIDDEN_APIS = [
  'Deno.readFile',
  'Deno.writeFile',
  'Deno.readTextFile',
  'Deno.writeTextFile',
  'Deno.open',
  'Deno.create',
  'Deno.mkdir',
  'Deno.remove',
  'Deno.rename',
  'Deno.stat',
  'Deno.lstat',
  'Deno.readDir',
  'Deno.copyFile',
  'Deno.link',
  'Deno.symlink',
  'Deno.readLink',
  'Deno.realPath',
  'Deno.makeTempDir',
  'Deno.makeTempFile',
  'Deno.cwd',
  'Deno.chdir',
  'Deno.env',
  'Deno.exit',
  'Deno.run',
  'Deno.Command',
  'Deno.connect',
  'Deno.listen',
  'Deno.serve',
  'Deno.serveHttp',
  'Deno.upgradeWebSocket',
  'Deno.stdin',
  'Deno.stdout',
  'Deno.stderr',
];

/**
 * Bun-specific builtins that are forbidden in workflow code.
 */
const BUN_FORBIDDEN_BUILTINS = ['bun:sqlite', 'bun:ffi', 'bun:jsc', 'bun:test'];

/**
 * Walk the workflows directory and up to 3 parent directories to find a deno.json or deno.jsonc.
 * Returns the resolved path if found, undefined otherwise.
 */
export function findDenoConfig(workflowsPath: string): string | undefined {
  const dir = dirname(resolve(workflowsPath));

  // Check immediate directory
  for (const name of ['deno.json', 'deno.jsonc']) {
    const candidate = join(dir, name);
    if (existsSync(candidate)) return candidate;
  }

  // Check parent directories (up to 3 levels)
  let currentDir = dir;
  for (let i = 0; i < 3; i++) {
    const parentDir = dirname(currentDir);
    if (parentDir === currentDir) break;
    currentDir = parentDir;

    for (const name of ['deno.json', 'deno.jsonc']) {
      const candidate = join(currentDir, name);
      if (existsSync(candidate)) return candidate;
    }
  }

  return undefined;
}

/**
 * Detect the input flavor based on config files and project structure.
 */
export function detectInputFlavor(workflowsPath: string): InputFlavor {
  const dir = dirname(resolve(workflowsPath));

  // Check for Deno config files (including import_map.json in immediate dir)
  if (findDenoConfig(workflowsPath) || existsSync(join(dir, 'import_map.json'))) {
    return 'deno';
  }

  // Check for Bun config
  if (existsSync(join(dir, 'bunfig.toml'))) {
    return 'bun';
  }

  // Check parent directories for Bun config
  let currentDir = dir;
  for (let i = 0; i < 3; i++) {
    const parentDir = dirname(currentDir);
    if (parentDir === currentDir) break;
    currentDir = parentDir;

    if (existsSync(join(currentDir, 'bunfig.toml'))) {
      return 'bun';
    }
  }

  return 'node';
}

/**
 * Parse a deno.json or deno.jsonc config file.
 */
export function parseDenoConfig(configPath: string): {
  importMap?: ImportMap;
  importMapPath?: string;
  compilerOptions?: Record<string, unknown>;
} {
  if (!existsSync(configPath)) {
    throw new Error(`Deno config file not found: ${configPath}`);
  }

  const content = readFileSync(configPath, 'utf-8');

  // Handle JSONC (JSON with comments) - strip comments
  const jsonContent = content
    .replace(/\/\/.*$/gm, '') // Remove single-line comments
    .replace(/\/\*[\s\S]*?\*\//g, ''); // Remove multi-line comments

  const config = JSON.parse(jsonContent) as {
    imports?: Record<string, string>;
    scopes?: Record<string, Record<string, string>>;
    importMap?: string;
    compilerOptions?: Record<string, unknown>;
  };

  const result: {
    importMap?: ImportMap;
    importMapPath?: string;
    compilerOptions?: Record<string, unknown>;
  } = {};

  // Check for inline import map
  if (config.imports || config.scopes) {
    const importMap: ImportMap = {};
    if (config.imports) {
      importMap.imports = config.imports;
    }
    if (config.scopes) {
      importMap.scopes = config.scopes;
    }
    result.importMap = importMap;
  }

  // Check for external import map reference
  if (config.importMap) {
    result.importMapPath = resolve(dirname(configPath), config.importMap);
  }

  if (config.compilerOptions) {
    result.compilerOptions = config.compilerOptions;
  }

  return result;
}

/**
 * Parse an import map file.
 */
export function parseImportMap(importMapPath: string): ImportMap {
  if (!existsSync(importMapPath)) {
    throw new Error(`Import map file not found: ${importMapPath}`);
  }

  const content = readFileSync(importMapPath, 'utf-8');
  const importMap = JSON.parse(content) as ImportMap;

  return {
    imports: importMap.imports ?? {},
    scopes: importMap.scopes ?? {},
  };
}

/**
 * Load the effective import map from config.
 */
export function loadImportMap(
  config: CrossRuntimeConfig,
  workflowsPath: string,
): ImportMap | undefined {
  // Explicit import map path takes precedence
  if (config.importMapPath) {
    return parseImportMap(config.importMapPath);
  }

  // Check for deno config
  if (config.denoConfigPath) {
    const denoConfig = parseDenoConfig(config.denoConfigPath);

    // External import map in deno.json
    if (denoConfig.importMapPath) {
      return parseImportMap(denoConfig.importMapPath);
    }

    // Inline import map in deno.json
    if (denoConfig.importMap) {
      return denoConfig.importMap;
    }
  }

  // Auto-detect deno.json
  const dir = dirname(resolve(workflowsPath));
  const denoJsonPath = join(dir, 'deno.json');
  const denoJsoncPath = join(dir, 'deno.jsonc');

  if (existsSync(denoJsonPath)) {
    const denoConfig = parseDenoConfig(denoJsonPath);
    if (denoConfig.importMapPath) {
      return parseImportMap(denoConfig.importMapPath);
    }
    return denoConfig.importMap;
  }

  if (existsSync(denoJsoncPath)) {
    const denoConfig = parseDenoConfig(denoJsoncPath);
    if (denoConfig.importMapPath) {
      return parseImportMap(denoConfig.importMapPath);
    }
    return denoConfig.importMap;
  }

  return undefined;
}

/**
 * Check if a specifier is an npm: specifier.
 */
export function isNpmSpecifier(specifier: string): boolean {
  return specifier.startsWith('npm:');
}

/**
 * Parse an npm: specifier into package name and version.
 *
 * Examples:
 * - npm:lodash -> { name: 'lodash', version: undefined }
 * - npm:lodash@4.17.21 -> { name: 'lodash', version: '4.17.21' }
 * - npm:@types/node@18 -> { name: '@types/node', version: '18' }
 * - npm:@temporalio/workflow -> { name: '@temporalio/workflow', version: undefined }
 */
export function parseNpmSpecifier(specifier: string): {
  name: string;
  version?: string;
  subpath?: string;
} {
  if (!specifier.startsWith('npm:')) {
    throw new Error(`Not an npm specifier: ${specifier}`);
  }

  const withoutPrefix = specifier.slice(4); // Remove 'npm:'

  let name: string;
  let version: string | undefined;
  let subpath: string | undefined;

  if (withoutPrefix.startsWith('@')) {
    // Scoped package: @scope/package[@version][/subpath]
    // Find the second slash (after @scope/package)
    const firstSlash = withoutPrefix.indexOf('/');
    if (firstSlash === -1) {
      // Just @scope (invalid but handle gracefully)
      name = withoutPrefix;
      return { name };
    }

    // Find where the package name ends
    // Could be: @scope/package, @scope/package@version, @scope/package/subpath
    const afterScope = withoutPrefix.slice(firstSlash + 1);

    // Find @ (version) or / (subpath) in the package part
    const versionIndex = afterScope.indexOf('@');
    const subpathIndex = afterScope.indexOf('/');

    if (versionIndex === -1 && subpathIndex === -1) {
      // Just @scope/package
      name = withoutPrefix;
    } else if (versionIndex === -1) {
      // @scope/package/subpath (no version)
      name = withoutPrefix.slice(0, firstSlash + 1 + subpathIndex);
      subpath = afterScope.slice(subpathIndex);
    } else if (subpathIndex === -1 || versionIndex < subpathIndex) {
      // @scope/package@version or @scope/package@version/subpath
      name = withoutPrefix.slice(0, firstSlash + 1 + versionIndex);
      const afterVersion = afterScope.slice(versionIndex + 1);
      const versionSlash = afterVersion.indexOf('/');
      if (versionSlash === -1) {
        version = afterVersion;
      } else {
        version = afterVersion.slice(0, versionSlash);
        subpath = afterVersion.slice(versionSlash);
      }
    } else {
      // @scope/package/subpath (subpath before any @)
      name = withoutPrefix.slice(0, firstSlash + 1 + subpathIndex);
      subpath = afterScope.slice(subpathIndex);
    }
  } else {
    // Unscoped package: package[@version][/subpath]
    const versionIndex = withoutPrefix.indexOf('@');
    const subpathIndex = withoutPrefix.indexOf('/');

    if (versionIndex === -1 && subpathIndex === -1) {
      // Just package
      name = withoutPrefix;
    } else if (versionIndex === -1) {
      // package/subpath
      name = withoutPrefix.slice(0, subpathIndex);
      subpath = withoutPrefix.slice(subpathIndex);
    } else if (subpathIndex === -1 || versionIndex < subpathIndex) {
      // package@version or package@version/subpath
      name = withoutPrefix.slice(0, versionIndex);
      const afterVersion = withoutPrefix.slice(versionIndex + 1);
      const versionSlash = afterVersion.indexOf('/');
      if (versionSlash === -1) {
        version = afterVersion;
      } else {
        version = afterVersion.slice(0, versionSlash);
        subpath = afterVersion.slice(versionSlash);
      }
    } else {
      // package/subpath (subpath before @)
      name = withoutPrefix.slice(0, subpathIndex);
      subpath = withoutPrefix.slice(subpathIndex);
    }
  }

  const result: { name: string; version?: string; subpath?: string } = { name };
  if (version) {
    result.version = version;
  }
  if (subpath) {
    result.subpath = subpath;
  }
  return result;
}

/**
 * Check if a specifier is a URL import.
 */
export function isUrlImport(specifier: string): boolean {
  return specifier.startsWith('https://') || specifier.startsWith('http://');
}

/**
 * Check if a URL is pinned (has a specific version).
 */
export function isUrlPinned(url: string): boolean {
  // Check for common versioning patterns
  const patterns = [
    /@\d+\.\d+\.\d+/, // @1.2.3
    /@v\d+\.\d+\.\d+/, // @v1.2.3
    /\/v\d+\.\d+\.\d+\//, // /v1.2.3/
    /\/\d+\.\d+\.\d+\//, // /1.2.3/
    /[?&]v=\d+/, // ?v=123
    /[?&]version=\d+/, // ?version=123
  ];

  return patterns.some((pattern) => pattern.test(url));
}

/**
 * Generate a cache key for a URL.
 */
export function urlToCacheKey(url: string): string {
  const hash = createHash('sha256').update(url).digest('hex').slice(0, 16);
  const urlObj = new URL(url);
  const safePath = urlObj.pathname.replace(/[^a-zA-Z0-9.-]/g, '_');
  return `${urlObj.hostname}${safePath}_${hash}`;
}

/**
 * Fetch and cache a URL import.
 */
export async function fetchAndCacheUrl(
  url: string,
  cacheDir: string,
): Promise<UrlImportCache> {
  // Ensure cache directory exists
  if (!existsSync(cacheDir)) {
    mkdirSync(cacheDir, { recursive: true });
  }

  const cacheKey = urlToCacheKey(url);
  const cachePath = join(cacheDir, cacheKey);
  const metaPath = join(cacheDir, `${cacheKey}.meta.json`);

  // Check if already cached
  if (existsSync(cachePath) && existsSync(metaPath)) {
    const meta = JSON.parse(readFileSync(metaPath, 'utf-8')) as UrlImportCache;

    // Verify integrity
    const content = readFileSync(cachePath, 'utf-8');
    const hash = createHash('sha256').update(content).digest('hex');

    if (hash === meta.integrity) {
      return meta;
    }
    // Integrity mismatch, re-fetch
  }

  // Fetch the URL
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`Failed to fetch ${url}: ${response.status} ${response.statusText}`);
  }

  const content = await response.text();
  const contentType = response.headers.get('content-type') ?? undefined;
  const integrity = createHash('sha256').update(content).digest('hex');

  // Write content to cache
  writeFileSync(cachePath, content);

  // Write metadata
  const meta: UrlImportCache = {
    url,
    localPath: cachePath,
    integrity,
    fetchedAt: new Date().toISOString(),
    contentType,
  };

  writeFileSync(metaPath, JSON.stringify(meta, null, 2));

  return meta;
}

/**
 * Check for forbidden runtime-specific APIs in source code.
 */
export function detectForbiddenRuntimeApis(
  source: string,
  flavor: InputFlavor,
): Array<{ api: string; line?: number }> {
  const forbidden: Array<{ api: string; line?: number }> = [];

  if (flavor === 'deno' || flavor === 'auto') {
    // Check for Deno.* APIs
    const denoPattern = /\bDeno\.(\w+)/g;
    let match;
    while ((match = denoPattern.exec(source)) !== null) {
      const api = `Deno.${match[1]}`;
      if (DENO_FORBIDDEN_APIS.includes(api)) {
        // Calculate line number
        const beforeMatch = source.slice(0, match.index);
        const line = (beforeMatch.match(/\n/g) ?? []).length + 1;
        forbidden.push({ api, line });
      }
    }
  }

  if (flavor === 'bun' || flavor === 'auto') {
    // Check for bun: builtins
    const bunPattern = /from\s+['"]bun:([\w-]+)['"]/g;
    let match;
    while ((match = bunPattern.exec(source)) !== null) {
      const builtin = `bun:${match[1]}`;
      if (BUN_FORBIDDEN_BUILTINS.includes(builtin)) {
        const beforeMatch = source.slice(0, match.index);
        const line = (beforeMatch.match(/\n/g) ?? []).length + 1;
        forbidden.push({ api: builtin, line });
      }
    }
  }

  return forbidden;
}

/**
 * Create an esbuild plugin for cross-runtime support.
 */
export function createCrossRuntimePlugin(
  config: CrossRuntimeConfig,
  workflowsPath: string,
): esbuild.Plugin {
  const flavor = config.inputFlavor ?? detectInputFlavor(workflowsPath);
  const importMap = loadImportMap(config, workflowsPath);
  const cacheDir = config.urlCacheDir ?? DEFAULT_CACHE_DIR;
  const allowUrlImports = config.allowUrlImports ?? flavor === 'deno';
  const requirePinned = config.requirePinnedUrls ?? true;

  return {
    name: 'temporal-cross-runtime',
    setup(build) {
      // Pre-compute base directory for resolving relative import map paths
      const baseDir = dirname(config.importMapPath ?? workflowsPath);

      // Apply import map resolution
      if (importMap?.imports) {
        const imports = importMap.imports;
        build.onResolve({ filter: /.*/ }, (args) => {
          // Check direct imports mapping
          const mapped = imports[args.path];
          if (mapped !== undefined) {
            // Handle npm: specifiers
            if (isNpmSpecifier(mapped)) {
              const { name, subpath } = parseNpmSpecifier(mapped);
              return { path: subpath ? `${name}${subpath}` : name, external: false };
            }

            // Handle URL imports
            if (isUrlImport(mapped)) {
              return { path: mapped, namespace: 'url-import' };
            }

            // Handle relative/absolute paths
            if (
              mapped.startsWith('./') ||
              mapped.startsWith('../') ||
              mapped.startsWith('/')
            ) {
              return {
                path: resolve(baseDir, mapped),
              };
            }

            return { path: mapped };
          }

          // Check prefix mappings (e.g., "lodash/" -> "npm:lodash@4/")
          for (const [prefix, target] of Object.entries(imports)) {
            if (prefix.endsWith('/') && args.path.startsWith(prefix)) {
              const suffix = args.path.slice(prefix.length);
              const prefixMapped = target + suffix;

              if (isNpmSpecifier(prefixMapped)) {
                const { name, subpath } = parseNpmSpecifier(prefixMapped);
                return { path: subpath ? `${name}${subpath}` : name, external: false };
              }

              return { path: prefixMapped };
            }
          }

          return null;
        });
      }

      // Handle npm: specifiers directly
      build.onResolve({ filter: /^npm:/ }, (args) => {
        const { name, subpath } = parseNpmSpecifier(args.path);
        return { path: subpath ? `${name}${subpath}` : name, external: false };
      });

      // Handle URL imports
      build.onResolve({ filter: /^https?:\/\// }, (args) => {
        if (!allowUrlImports) {
          return {
            errors: [
              {
                text: `URL imports are not allowed. Set allowUrlImports: true to enable.`,
                detail: args.path,
              },
            ],
          };
        }

        if (requirePinned && !isUrlPinned(args.path)) {
          return {
            errors: [
              {
                text: `URL import must be pinned to a specific version for reproducibility: ${args.path}`,
                detail:
                  'Add a version number to the URL (e.g., @1.2.3) or set requirePinnedUrls: false',
              },
            ],
          };
        }

        return { path: args.path, namespace: 'url-import' };
      });

      // Load URL imports from cache
      build.onLoad({ filter: /.*/, namespace: 'url-import' }, async (args) => {
        const cache = await fetchAndCacheUrl(args.path, cacheDir);

        // Determine loader based on content type and file extension
        let loader: esbuild.Loader = 'js';
        if (args.path.endsWith('.tsx')) {
          loader = 'tsx';
        } else if (args.path.endsWith('.jsx')) {
          loader = 'jsx';
        } else if (args.path.endsWith('.ts')) {
          loader = 'ts';
        } else if (cache.contentType?.includes('typescript')) {
          loader = 'ts';
        }

        const content = readFileSync(cache.localPath, 'utf-8');

        return {
          contents: content,
          loader,
          resolveDir: cacheDir,
        };
      });

      // Block bun: builtins
      build.onResolve({ filter: /^bun:/ }, (args) => {
        if (BUN_FORBIDDEN_BUILTINS.includes(args.path)) {
          return {
            errors: [
              {
                text: `Bun builtin '${args.path}' cannot be used in workflow code as it breaks determinism.`,
                detail: 'Move this code to an Activity.',
              },
            ],
          };
        }
        return null;
      });
    },
  };
}

/**
 * Get the effective cross-runtime configuration.
 */
export function resolveCrossRuntimeConfig(
  workflowsPath: string,
  inputFlavor?: InputFlavor,
  denoConfigPath?: string,
  importMapPath?: string,
): CrossRuntimeConfig {
  const resolvedFlavor =
    inputFlavor === 'auto' || !inputFlavor
      ? detectInputFlavor(workflowsPath)
      : inputFlavor;

  const resolvedDenoConfigPath =
    denoConfigPath ??
    (resolvedFlavor === 'deno' ? findDenoConfig(workflowsPath) : undefined);

  return {
    inputFlavor: resolvedFlavor,
    denoConfigPath: resolvedDenoConfigPath,
    importMapPath,
    allowUrlImports: resolvedFlavor === 'deno',
    requirePinnedUrls: true,
  };
}
