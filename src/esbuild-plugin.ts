/**
 * esbuild plugin for Temporal workflow bundling.
 *
 * Handles:
 * - Module resolution for allowed builtins (assert, url, util)
 * - Converter aliasing (__temporal_custom_payload_converter$, etc.)
 * - Forbidden module detection and blocking
 * - OpenTelemetry module replacement
 * - Ignored modules (with runtime-throwing stubs)
 */

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
 * Create the Temporal workflow esbuild plugin.
 * Returns both the plugin and a state object for post-build validation.
 */
export function createTemporalPlugin(
  options: TemporalPluginOptions,
): TemporalPluginResult {
  const { ignoreModules, payloadConverterPath, failureConverterPath } = options;
  const policy = options.policy ?? loadDeterminismPolicy();
  const builtinPattern = createBuiltinPattern();

  // Shared state for post-build validation
  const state: TemporalPluginState = {
    foundProblematicModules: new Map(),
  };

  const plugin: esbuild.Plugin = {
    name: 'temporal-workflow',
    setup(build) {
      // Reference to shared state
      const foundProblematicModules = state.foundProblematicModules;

      // ============================================================
      // 1. Handle ALL Node.js builtins with a single handler
      // This ensures we intercept them before esbuild's default handling
      // ============================================================
      build.onResolve({ filter: builtinPattern }, (args) => {
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

        // Forbidden builtin - record and return stub
        foundProblematicModules.set(normalized, args.importer || 'unknown');
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

        // Builtins are already handled by the builtinPattern handler above
        // This is a safety check that can be removed if performance is critical
        if (isAllowedBuiltin(normalized)) {
          return null;
        }

        // Check if this is an ignored module - return stub that throws at runtime
        if (isIgnored(normalized, ignoreModules)) {
          return {
            path: normalized,
            namespace: 'temporal-ignored',
          };
        }

        // Check against forbidden list
        if (isForbidden(normalized, policy)) {
          // Record for error reporting and return a stub to prevent esbuild errors
          foundProblematicModules.set(normalized, args.importer || 'unknown');
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

      // Note: We don't throw in onEnd because esbuild wraps the error and loses type info.
      // Instead, the bundler checks state.foundProblematicModules after the build.
    },
  };

  return { plugin, state };
}
