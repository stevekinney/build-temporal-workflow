/**
 * Text loader plugin for importing text files as strings.
 *
 * @example
 * ```typescript
 * import { textLoader } from 'build-temporal-workflow/plugins/text';
 *
 * const bundle = await bundleWorkflowCode({
 *   workflowsPath: './src/workflows.ts',
 *   buildOptions: {
 *     plugins: [textLoader()],
 *   },
 * });
 * ```
 *
 * @example
 * ```typescript
 * // Custom extensions
 * textLoader({ extensions: ['.txt', '.md', '.html'] })
 * ```
 *
 * @module
 */

import { readFileSync } from 'node:fs';

import type * as esbuild from 'esbuild';

/**
 * Options for the text loader plugin.
 */
export interface TextLoaderOptions {
  /**
   * File extensions to handle.
   * @default ['.txt', '.md']
   */
  extensions?: string[];
}

/**
 * Default extensions for the text loader.
 */
export const DEFAULT_TEXT_EXTENSIONS = ['.txt', '.md'] as const;

/**
 * Create an esbuild plugin that loads text files as strings.
 *
 * @example
 * ```typescript
 * // In workflow code:
 * import readme from './README.md';
 * import notes from './notes.txt';
 * // readme and notes are strings
 * ```
 */
export function textLoader(options: TextLoaderOptions = {}): esbuild.Plugin {
  const extensions = options.extensions ?? [...DEFAULT_TEXT_EXTENSIONS];
  const escapedExts = extensions.map((ext) =>
    ext.replace(/^\./, '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&'),
  );
  const filter = new RegExp(`\\.(${escapedExts.join('|')})$`);

  return {
    name: 'temporal-text-loader',
    setup(build) {
      build.onLoad({ filter }, (args) => {
        const content = readFileSync(args.path, 'utf-8');
        return {
          contents: `export default ${JSON.stringify(content)};`,
          loader: 'js',
        };
      });
    },
  };
}

export default textLoader;
