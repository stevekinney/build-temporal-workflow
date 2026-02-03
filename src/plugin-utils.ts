/**
 * Plugin composition helpers and priority system.
 *
 * Utilities for composing, ordering, and managing bundler plugins.
 */

import type { BunPlugin } from 'bun';
import type * as esbuild from 'esbuild';

import type { BundlerPlugin, ExtendedBundlerPlugin } from './types';

/**
 * Result of composing plugins from multiple sources.
 */
export interface ComposedPlugins {
  esbuild: esbuild.Plugin[];
  bun: BunPlugin[];
}

/**
 * Compose esbuild and Bun plugins from mixed arrays.
 *
 * Separates plugins by type and returns them organized for use
 * with either bundler backend.
 *
 * @example
 * ```typescript
 * import { composePlugins } from 'bundle-temporal-workflow';
 *
 * const composed = composePlugins(
 *   [myEsbuildPlugin1, myEsbuildPlugin2],
 *   [myBunPlugin],
 * );
 *
 * // Use with esbuild
 * esbuild.build({ plugins: composed.esbuild });
 *
 * // Use with Bun
 * Bun.build({ plugins: composed.bun });
 * ```
 */
export function composePlugins(
  esbuildPlugins: esbuild.Plugin[] = [],
  bunPlugins: BunPlugin[] = [],
): ComposedPlugins {
  return {
    esbuild: [...esbuildPlugins],
    bun: [...bunPlugins],
  };
}

/**
 * Sort bundler plugins by priority (lower values run first).
 *
 * Plugins without a priority are assigned a default of 100.
 *
 * @example
 * ```typescript
 * import { sortPluginsByPriority } from 'bundle-temporal-workflow';
 *
 * const sorted = sortPluginsByPriority([
 *   { name: 'last', priority: 200 },
 *   { name: 'first', priority: 10 },
 *   { name: 'middle' }, // default priority: 100
 * ]);
 * // Result: [first(10), middle(100), last(200)]
 * ```
 */
export function sortPluginsByPriority(
  plugins: ExtendedBundlerPlugin[],
): ExtendedBundlerPlugin[] {
  return [...plugins].sort((a, b) => {
    const aPriority = a.priority ?? 100;
    const bPriority = b.priority ?? 100;
    return aPriority - bPriority;
  });
}

/**
 * Merge multiple plugin arrays, deduplicating by name.
 *
 * When plugins share the same name, the later occurrence wins.
 */
export function mergePlugins(...pluginArrays: BundlerPlugin[][]): BundlerPlugin[] {
  const seen = new Map<string, BundlerPlugin>();

  for (const plugins of pluginArrays) {
    for (const plugin of plugins) {
      seen.set(plugin.name, plugin);
    }
  }

  return Array.from(seen.values());
}

/**
 * Create a simple bundler plugin from a configuration function.
 *
 * @example
 * ```typescript
 * import { createPlugin } from 'bundle-temporal-workflow';
 *
 * const myPlugin = createPlugin('my-plugin', (options) => ({
 *   ...options,
 *   mode: 'production',
 * }));
 * ```
 */
export function createPlugin(
  name: string,
  configureBundler?: BundlerPlugin['configureBundler'],
  priority?: number,
): ExtendedBundlerPlugin {
  return {
    name,
    ...(configureBundler !== undefined && { configureBundler }),
    ...(priority !== undefined && { priority }),
  };
}

/**
 * Create a plugin that adds esbuild plugins to the build.
 */
export function createEsbuildPluginAdapter(
  name: string,
  esbuildPlugin: esbuild.Plugin,
  priority?: number,
): ExtendedBundlerPlugin {
  return {
    name,
    ...(priority !== undefined && { priority }),
    configureBundler(options) {
      return {
        ...options,
        buildOptions: {
          ...options.buildOptions,
          plugins: [...(options.buildOptions?.plugins ?? []), esbuildPlugin],
        },
      };
    },
  };
}
