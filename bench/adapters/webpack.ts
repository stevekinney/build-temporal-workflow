/**
 * Webpack adapter for benchmarking.
 * Wraps Temporal SDK's bundleWorkflowCode with the BundlerAdapter interface.
 */

import { bundleWorkflowCode } from '@temporalio/worker';

import type { BundleOutput, BundlerAdapter } from '../types';

/**
 * Create a webpack-based bundler adapter (Temporal SDK's default).
 */
export function createWebpackAdapter(): BundlerAdapter {
  return {
    name: 'webpack',

    async bundle(workflowsPath: string): Promise<BundleOutput> {
      const result = await bundleWorkflowCode({
        workflowsPath,
        // Disable source maps for fair comparison
        sourceMapOptions: undefined,
      });

      return {
        code: result.code,
        size: result.code.length,
      };
    },
  };
}
