/**
 * esbuild adapter for benchmarking.
 * Wraps this project's bundler with the BundlerAdapter interface.
 */

import { bundleWorkflowCode } from '../../src/bundler';
import type { BundleOutput, BundlerAdapter } from '../types';

/**
 * Create an esbuild-based bundler adapter.
 */
export function createEsbuildAdapter(): BundlerAdapter {
  return {
    name: 'esbuild',

    async bundle(workflowsPath: string): Promise<BundleOutput> {
      const result = await bundleWorkflowCode({
        workflowsPath,
        sourceMap: 'none',
        report: false,
      });

      return {
        code: result.code,
        size: result.code.length,
      };
    },
  };
}
