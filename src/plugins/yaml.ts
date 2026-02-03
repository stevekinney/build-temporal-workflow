/**
 * YAML loader plugin for importing YAML files as parsed objects.
 *
 * @example
 * ```typescript
 * import { yamlLoader } from 'build-temporal-workflow/plugins/yaml';
 *
 * const bundle = await bundleWorkflowCode({
 *   workflowsPath: './src/workflows.ts',
 *   buildOptions: {
 *     plugins: [yamlLoader()],
 *   },
 * });
 * ```
 *
 * @example
 * ```typescript
 * // Custom extensions
 * yamlLoader({ extensions: ['.yaml', '.yml', '.eyaml'] })
 * ```
 *
 * @module
 */

import { readFileSync } from 'node:fs';

import type * as esbuild from 'esbuild';
import { parse as parseYaml } from 'yaml';

/**
 * Options for the YAML loader plugin.
 */
export interface YamlLoaderOptions {
  /**
   * File extensions to handle.
   * @default ['.yaml', '.yml']
   */
  extensions?: string[];
}

/**
 * Default extensions for the YAML loader.
 */
export const DEFAULT_YAML_EXTENSIONS = ['.yaml', '.yml'] as const;

/**
 * Create an esbuild plugin that loads and parses YAML files.
 *
 * @example
 * ```typescript
 * // In workflow code:
 * import data from './data.yaml';
 * import config from './config.yml';
 * // data and config are parsed objects
 * ```
 */
export function yamlLoader(options: YamlLoaderOptions = {}): esbuild.Plugin {
  const extensions = options.extensions ?? [...DEFAULT_YAML_EXTENSIONS];
  const escapedExts = extensions.map((ext) =>
    ext.replace(/^\./, '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&'),
  );
  const filter = new RegExp(`\\.(${escapedExts.join('|')})$`);

  return {
    name: 'temporal-yaml-loader',
    setup(build) {
      build.onLoad({ filter }, (args) => {
        const content = readFileSync(args.path, 'utf-8');
        const parsed: unknown = parseYaml(content);
        return {
          contents: `export default ${JSON.stringify(parsed)};`,
          loader: 'js',
        };
      });
    },
  };
}

export default yamlLoader;
