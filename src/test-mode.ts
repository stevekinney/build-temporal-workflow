/**
 * Test-specific bundling with mock support.
 *
 * Provides a test-oriented bundle configuration that supports
 * module mocking and relaxed determinism constraints.
 */

import * as esbuild from 'esbuild';

import { bundleWorkflowCode } from './bundler';
import type { TestBundleOptions, WorkflowBundle } from './types';

/**
 * Bundle workflow code with test-specific configuration.
 *
 * Supports:
 * - Module mocking (replace modules with test doubles)
 * - Relaxed determinism checks (allow Date.now, Math.random in tests)
 * - Additional test-friendly defaults
 *
 * @example
 * ```typescript
 * import { bundleForTesting } from 'bundle-temporal-workflow';
 *
 * const bundle = await bundleForTesting({
 *   workflowsPath: './src/workflows.ts',
 *   mocks: {
 *     './external-service': './test/mocks/external-service.ts',
 *     'some-package': './test/mocks/some-package.ts',
 *   },
 *   relaxedDeterminism: true,
 * });
 * ```
 */
export async function bundleForTesting(
  options: TestBundleOptions,
): Promise<WorkflowBundle> {
  const plugins: esbuild.Plugin[] = [];

  // Add mock resolution plugin
  if (options.mocks && Object.keys(options.mocks).length > 0) {
    plugins.push(createMockPlugin(options.mocks));
  }

  // Add relaxed determinism plugin
  if (options.relaxedDeterminism) {
    plugins.push(createRelaxedDeterminismPlugin());
  }

  return bundleWorkflowCode({
    ...options,
    mode: options.mode ?? 'development',
    buildOptions: {
      ...options.buildOptions,
      plugins: [...(options.buildOptions?.plugins ?? []), ...plugins],
    },
  });
}

/**
 * Create an esbuild plugin that resolves mock modules.
 */
function createMockPlugin(mocks: Record<string, string>): esbuild.Plugin {
  return {
    name: 'temporal-test-mocks',
    setup(build) {
      for (const [original, mock] of Object.entries(mocks)) {
        const escapedOriginal = original.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const filter = new RegExp(`^${escapedOriginal}$`);

        build.onResolve({ filter }, () => {
          return { path: require.resolve(mock) };
        });
      }
    },
  };
}

/**
 * Create an esbuild plugin that allows some non-deterministic patterns in test mode.
 *
 * In test mode, patterns like Date.now() and Math.random() are allowed
 * because test workflows may need them for setup/teardown or assertions.
 */
function createRelaxedDeterminismPlugin(): esbuild.Plugin {
  return {
    name: 'temporal-relaxed-determinism',
    setup(build) {
      // In relaxed mode, we allow some patterns that would normally be forbidden.
      // This is achieved by the bundler options already disabling strict checks.
      // This plugin serves as a marker that relaxed mode is active.
      build.onStart(() => {
        // No-op: presence of this plugin signals relaxed mode
      });
    },
  };
}
