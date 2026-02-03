/**
 * Bun plugin for bundling Temporal workflow code.
 *
 * @example
 * ```ts
 * // bunfig.toml or preload script
 * import { temporalWorkflow } from 'build-temporal-workflow/bun';
 * Bun.plugin(temporalWorkflow());
 *
 * // app code
 * import bundle from './workflows?workflow';
 * const worker = await Worker.create({ workflowBundle: bundle, taskQueue: 'q' });
 * ```
 *
 * @example
 * ```ts
 * // Using with Bun.build
 * import { temporalWorkflow } from 'build-temporal-workflow/bun';
 *
 * await Bun.build({
 *   entrypoints: ['./src/index.ts'],
 *   plugins: [temporalWorkflow()],
 * });
 * ```
 *
 * @module
 */

import { resolve } from 'node:path';

import { bundleWorkflowCode } from './bundler';
import type { BundleOptions, WorkflowBundle } from './types';

const PLUGIN_NAME = 'temporal-workflow';
const NAMESPACE = 'temporal-workflow';

export interface TemporalWorkflowPluginOptions {
  /** Query param identifier. Default: 'workflow' */
  identifier?: string;
  /** Forwarded to bundleWorkflowCode (minus workflowsPath) */
  bundleOptions?: Omit<BundleOptions, 'workflowsPath'>;
}

/**
 * Create a Bun plugin for bundling Temporal workflow code.
 *
 * The plugin intercepts imports with the `?workflow` query parameter
 * (or custom identifier) and bundles the workflow code at build time.
 *
 * @example
 * ```ts
 * // Register as a runtime plugin
 * import { temporalWorkflow } from 'build-temporal-workflow/bun';
 * Bun.plugin(temporalWorkflow());
 *
 * // Then import workflows
 * import bundle from './workflows?workflow';
 * ```
 *
 * @example
 * ```ts
 * // Use with Bun.build
 * await Bun.build({
 *   entrypoints: ['./src/worker.ts'],
 *   plugins: [temporalWorkflow()],
 * });
 * ```
 */
export function temporalWorkflow(
  options: TemporalWorkflowPluginOptions = {},
): import('bun').BunPlugin {
  const identifier = options.identifier ?? 'workflow';
  const queryMarker = `?${identifier}`;
  const cache = new Map<string, WorkflowBundle>();

  return {
    name: PLUGIN_NAME,
    setup(build) {
      // Resolve imports with the workflow query parameter
      build.onResolve({ filter: /.*/ }, (args) => {
        if (!args.path.includes(queryMarker)) {
          return undefined;
        }

        const cleanPath = args.path.split('?')[0]!;
        const resolveDir = args.importer
          ? args.importer.replace(/[/\\][^/\\]*$/, '')
          : (args.resolveDir ?? process.cwd());
        const resolved = resolve(resolveDir, cleanPath);

        return {
          path: resolved,
          namespace: NAMESPACE,
        };
      });

      // Load and bundle workflow code
      build.onLoad({ filter: /.*/, namespace: NAMESPACE }, async (args) => {
        const workflowsPath = args.path;

        // Check cache
        if (cache.has(workflowsPath)) {
          const bundle = cache.get(workflowsPath)!;
          return {
            contents: buildModule(bundle),
            loader: 'js',
          };
        }

        const bundle = await bundleWorkflowCode({
          workflowsPath,
          ...options.bundleOptions,
        });

        cache.set(workflowsPath, bundle);

        return {
          contents: buildModule(bundle),
          loader: 'js',
        };
      });
    },
  };
}

function buildModule(bundle: WorkflowBundle): string {
  return `export default { code: ${JSON.stringify(bundle.code)}, sourceMap: ${JSON.stringify(bundle.sourceMap ?? '')} };`;
}

export default temporalWorkflow;
