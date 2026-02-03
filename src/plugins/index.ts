/**
 * Static file loader plugins for importing non-JavaScript files.
 *
 * These plugins are opt-in and can be added to your bundle configuration
 * to enable importing static files like Markdown, TOML, YAML, and text files.
 *
 * @example
 * ```typescript
 * import { markdownLoader, tomlLoader, yamlLoader } from 'build-temporal-workflow/plugins';
 *
 * const bundle = await bundleWorkflowCode({
 *   workflowsPath: './src/workflows.ts',
 *   buildOptions: {
 *     plugins: [markdownLoader(), tomlLoader(), yamlLoader()],
 *   },
 * });
 * ```
 *
 * @module
 */

// Markdown loader
export {
  DEFAULT_MARKDOWN_EXTENSIONS,
  markdownLoader,
  type MarkdownLoaderOptions,
} from './markdown';

// Text loader
export { DEFAULT_TEXT_EXTENSIONS, textLoader, type TextLoaderOptions } from './text';

// TOML loader
export { DEFAULT_TOML_EXTENSIONS, tomlLoader, type TomlLoaderOptions } from './toml';

// YAML loader
export { DEFAULT_YAML_EXTENSIONS, yamlLoader, type YamlLoaderOptions } from './yaml';
