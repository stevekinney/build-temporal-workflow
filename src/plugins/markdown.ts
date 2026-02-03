/**
 * Markdown loader plugin for importing markdown files as strings.
 *
 * @example
 * ```typescript
 * import { markdownLoader } from 'build-temporal-workflow/plugins/markdown';
 *
 * const bundle = await bundleWorkflowCode({
 *   workflowsPath: './src/workflows.ts',
 *   buildOptions: {
 *     plugins: [markdownLoader()],
 *   },
 * });
 * ```
 *
 * @example
 * ```typescript
 * // Custom extensions
 * markdownLoader({ extensions: ['.md', '.mdx', '.markdown'] })
 * ```
 *
 * @module
 */

import { readFileSync } from 'node:fs';

import type * as esbuild from 'esbuild';

/**
 * Options for the markdown loader plugin.
 */
export interface MarkdownLoaderOptions {
  /**
   * File extensions to handle.
   * @default ['.md']
   */
  extensions?: string[];
}

/**
 * Default extensions for the markdown loader.
 */
export const DEFAULT_MARKDOWN_EXTENSIONS = ['.md'] as const;

/**
 * Create an esbuild plugin that loads markdown files as strings.
 *
 * @example
 * ```typescript
 * // In workflow code:
 * import readme from './README.md';
 * // readme is a string containing the markdown content
 * ```
 */
export function markdownLoader(options: MarkdownLoaderOptions = {}): esbuild.Plugin {
  const extensions = options.extensions ?? [...DEFAULT_MARKDOWN_EXTENSIONS];
  const escapedExts = extensions.map((ext) =>
    ext.replace(/^\./, '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&'),
  );
  const filter = new RegExp(`\\.(${escapedExts.join('|')})$`);

  return {
    name: 'temporal-markdown-loader',
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

export default markdownLoader;
