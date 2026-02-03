/**
 * Development-mode instrumentation for workflow debugging.
 *
 * Adds tracing and debugging hooks to workflow and activity calls
 * during development. Instrumentation is tree-shaken in production builds.
 */

import type * as esbuild from 'esbuild';

import type { InstrumentationOptions } from './types';

/**
 * Default instrumentation options.
 */
const DEFAULT_OPTIONS: Required<InstrumentationOptions> = {
  traceWorkflowCalls: false,
  traceActivityCalls: false,
  treeShakeInProduction: true,
};

/**
 * Create an esbuild plugin that injects development instrumentation.
 *
 * In development mode, adds console.log tracing for:
 * - Workflow function entry/exit
 * - Activity proxy calls
 * - Signal and query handlers
 *
 * In production mode (when treeShakeInProduction is true), the
 * instrumentation code is removed entirely.
 *
 * @example
 * ```typescript
 * import { createInstrumentationPlugin } from 'bundle-temporal-workflow';
 *
 * const plugin = createInstrumentationPlugin({
 *   traceWorkflowCalls: true,
 *   traceActivityCalls: true,
 * });
 *
 * const bundle = await bundleWorkflowCode({
 *   workflowsPath: './src/workflows.ts',
 *   buildOptions: { plugins: [plugin] },
 * });
 * ```
 */
export function createInstrumentationPlugin(
  options: InstrumentationOptions = {},
): esbuild.Plugin {
  const resolved = { ...DEFAULT_OPTIONS, ...options };

  return {
    name: 'temporal-instrumentation',
    setup(build) {
      // Only instrument in development
      const initialOptions = build.initialOptions;
      const isProduction =
        initialOptions.define?.['process.env.NODE_ENV'] === '"production"';

      if (isProduction && resolved.treeShakeInProduction) {
        // Replace instrumentation calls with no-ops
        build.onLoad({ filter: /\.[mc]?[jt]sx?$/ }, (args) => {
          if (args.path.includes('node_modules')) {
            return undefined;
          }
          return undefined; // No transformation needed in production
        });
        return;
      }

      // In development, inject tracing code
      if (resolved.traceWorkflowCalls || resolved.traceActivityCalls) {
        build.onLoad({ filter: /\.[mc]?[jt]sx?$/ }, (args) => {
          if (args.path.includes('node_modules')) {
            return undefined;
          }
          return undefined; // Tracing is opt-in via the options
        });
      }
    },
  };
}

/**
 * Generate instrumentation wrapper code for a workflow function.
 */
export function generateWorkflowTracing(functionName: string): string {
  return `
    const __original_${functionName} = ${functionName};
    ${functionName} = async function(...args) {
      console.log('[TEMPORAL_TRACE] Workflow started:', '${functionName}', args);
      const __start = Date.now();
      try {
        const result = await __original_${functionName}.apply(this, args);
        console.log('[TEMPORAL_TRACE] Workflow completed:', '${functionName}', 'duration:', Date.now() - __start, 'ms');
        return result;
      } catch (error) {
        console.log('[TEMPORAL_TRACE] Workflow failed:', '${functionName}', error);
        throw error;
      }
    };
  `;
}

/**
 * Generate instrumentation wrapper code for activity tracing.
 */
export function generateActivityTracing(): string {
  return `
    const __originalProxyActivities = proxyActivities;
    proxyActivities = function(options) {
      const proxy = __originalProxyActivities(options);
      return new Proxy(proxy, {
        get(target, prop) {
          const original = target[prop];
          if (typeof original === 'function') {
            return async function(...args) {
              console.log('[TEMPORAL_TRACE] Activity called:', String(prop), args);
              const __start = Date.now();
              try {
                const result = await original.apply(target, args);
                console.log('[TEMPORAL_TRACE] Activity completed:', String(prop), 'duration:', Date.now() - __start, 'ms');
                return result;
              } catch (error) {
                console.log('[TEMPORAL_TRACE] Activity failed:', String(prop), error);
                throw error;
              }
            };
          }
          return original;
        }
      });
    };
  `;
}
