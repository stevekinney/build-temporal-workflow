/**
 * TOML loader plugin for importing TOML files as parsed objects.
 *
 * @example
 * ```typescript
 * import { tomlLoader } from 'build-temporal-workflow/plugins/toml';
 *
 * const bundle = await bundleWorkflowCode({
 *   workflowsPath: './src/workflows.ts',
 *   buildOptions: {
 *     plugins: [tomlLoader()],
 *   },
 * });
 * ```
 *
 * @example
 * ```typescript
 * // Custom extensions
 * tomlLoader({ extensions: ['.toml', '.tml'] })
 * ```
 *
 * @module
 */

import { readFileSync } from 'node:fs';

import type * as esbuild from 'esbuild';
import { parse as parseToml } from 'smol-toml';

/**
 * Options for the TOML loader plugin.
 */
export interface TomlLoaderOptions {
  /**
   * File extensions to handle.
   * @default ['.toml']
   */
  extensions?: string[];
}

/**
 * Default extensions for the TOML loader.
 */
export const DEFAULT_TOML_EXTENSIONS = ['.toml'] as const;

/**
 * Create an esbuild plugin that loads and parses TOML files.
 *
 * @example
 * ```typescript
 * // In workflow code:
 * import config from './config.toml';
 * // config is a parsed object
 * ```
 */
export function tomlLoader(options: TomlLoaderOptions = {}): esbuild.Plugin {
  const extensions = options.extensions ?? [...DEFAULT_TOML_EXTENSIONS];
  const escapedExts = extensions.map((ext) =>
    ext.replace(/^\./, '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&'),
  );
  const filter = new RegExp(`\\.(${escapedExts.join('|')})$`);

  return {
    name: 'temporal-toml-loader',
    setup(build) {
      build.onLoad({ filter }, (args) => {
        const content = readFileSync(args.path, 'utf-8');
        const parsed = parseToml(content);
        return {
          contents: `export default ${JSON.stringify(parsed)};`,
          loader: 'js',
        };
      });
    },
  };
}

export default tomlLoader;
