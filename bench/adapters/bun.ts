/**
 * Bun.build adapter for benchmarking.
 * Wraps this project's bundler with the Bun backend.
 */

import { bundleWorkflowCode } from '../../src/bundler';
import type { BundleOutput, BundlerAdapter } from '../types';

/**
 * Create a Bun.build-based bundler adapter.
 */
export function createBunAdapter(): BundlerAdapter {
  return {
    name: 'bun',

    async bundle(workflowsPath: string): Promise<BundleOutput> {
      const result = await bundleWorkflowCode({
        workflowsPath,
        sourceMap: 'none',
        report: false,
        bundler: 'bun',
      });

      return {
        code: result.code,
        size: result.code.length,
      };
    },
  };
}
