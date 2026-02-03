/**
 * Multi-queue workflow bundling.
 *
 * Bundles multiple workflow entry points across different task queues,
 * sharing tsconfig, plugins, and build context for efficiency.
 */

import { bundleWorkflowCode, WorkflowCodeBundler } from './bundler';
import type { BundleOptions, MultiBundleOptions, WorkflowBundle } from './types';

/**
 * Bundle workflows for multiple task queues, sharing configuration.
 *
 * This is more efficient than calling bundleWorkflowCode() multiple times
 * because it shares the tsconfig resolution, plugin initialization, and
 * other setup work across builds.
 *
 * @example
 * ```typescript
 * const results = await bundleMultipleWorkflows({
 *   queues: [
 *     { name: 'orders', workflowsPath: './src/workflows/orders.ts' },
 *     { name: 'users', workflowsPath: './src/workflows/users.ts' },
 *     { name: 'notifications', workflowsPath: './src/workflows/notifications.ts' },
 *   ],
 *   shared: {
 *     tsconfigPath: './tsconfig.json',
 *     mode: 'production',
 *   },
 * });
 *
 * for (const [name, bundle] of results) {
 *   console.log(`${name}: ${bundle.code.length} bytes`);
 * }
 * ```
 */
export async function bundleMultipleWorkflows(
  options: MultiBundleOptions,
): Promise<Map<string, WorkflowBundle>> {
  const results = new Map<string, WorkflowBundle>();
  const shared = options.shared ?? {};

  const buildPromises = options.queues.map(async (queue) => {
    const bundleOptions: BundleOptions = {
      workflowsPath: queue.workflowsPath,
      tsconfigPath: shared.tsconfigPath,
      plugins: shared.plugins,
      mode: shared.mode,
      sourceMap: shared.sourceMap,
      ignoreModules: shared.ignoreModules,
      logger: shared.logger,
    };

    const bundle = await bundleWorkflowCode(bundleOptions);
    results.set(queue.name, bundle);
  });

  await Promise.all(buildPromises);

  return results;
}

/**
 * Create bundler instances for multiple queues that share configuration.
 *
 * Returns a map of queue name to WorkflowCodeBundler instances that can be
 * used for creating build contexts or watch mode.
 */
export function createMultiBundlers(
  options: MultiBundleOptions,
): Map<string, WorkflowCodeBundler> {
  const bundlers = new Map<string, WorkflowCodeBundler>();
  const shared = options.shared ?? {};

  for (const queue of options.queues) {
    const bundleOptions: BundleOptions = {
      workflowsPath: queue.workflowsPath,
      tsconfigPath: shared.tsconfigPath,
      plugins: shared.plugins,
      mode: shared.mode,
      sourceMap: shared.sourceMap,
      ignoreModules: shared.ignoreModules,
      logger: shared.logger,
    };

    bundlers.set(queue.name, new WorkflowCodeBundler(bundleOptions));
  }

  return bundlers;
}
