/**
 * Type definitions for the Temporal Workflow Bundler
 */

import type * as esbuild from 'esbuild';

/**
 * Logger interface compatible with Temporal's logger
 */
export interface Logger {
  trace(message: string, meta?: Record<string, unknown>): void;
  debug(message: string, meta?: Record<string, unknown>): void;
  info(message: string, meta?: Record<string, unknown>): void;
  warn(message: string, meta?: Record<string, unknown>): void;
  error(message: string, meta?: Record<string, unknown>): void;
}

/**
 * Plugin interface for bundler extensibility
 */
export interface BundlerPlugin {
  /**
   * The name of this plugin
   */
  readonly name: string;

  /**
   * Hook called when creating a bundler to allow modification of configuration
   */
  configureBundler?(options: BundleOptions): BundleOptions;
}

/**
 * Options for bundling Workflow code using esbuild
 */
export interface BundleOptions {
  /**
   * Path to look up workflows in. Any function exported in this path will be
   * registered as a Workflow when the bundle is loaded by a Worker.
   */
  workflowsPath: string;

  /**
   * List of modules to import Workflow interceptors from.
   * Modules should export an `interceptors` variable of type WorkflowInterceptorsFactory.
   */
  workflowInterceptorModules?: string[] | undefined;

  /**
   * Path to a module with a `payloadConverter` named export.
   * `payloadConverter` should be an instance of a class that implements PayloadConverter.
   */
  payloadConverterPath?: string | undefined;

  /**
   * Path to a module with a `failureConverter` named export.
   * `failureConverter` should be an instance of a class that implements FailureConverter.
   */
  failureConverterPath?: string | undefined;

  /**
   * List of modules to be excluded from the Workflows bundle.
   *
   * Use this option when your Workflow code references an import that cannot be used in isolation,
   * e.g. a Node.js built-in module. Modules listed here **MUST** not be used at runtime.
   *
   * > NOTE: This is an advanced option that should be used with care.
   */
  ignoreModules?: string[] | undefined;

  /**
   * Build mode: 'development' preserves debuggability, 'production' optimizes for size.
   * Note: Even in production, minification is disabled to preserve workflow type names.
   * Default: 'development'
   */
  mode?: 'development' | 'production' | undefined;

  /**
   * Source map generation mode.
   * - 'inline': Embed source maps in the bundle (default)
   * - 'external': Generate separate .map file
   * - 'none': No source maps
   */
  sourceMap?: 'inline' | 'external' | 'none' | undefined;

  /**
   * Additional esbuild options to merge with the bundler defaults.
   *
   * Note: Some options are enforced and cannot be overridden:
   * - bundle: true
   * - format: 'cjs'
   * - minify: false (breaks workflow type names)
   * - treeShaking: false (may remove workflow exports)
   * - splitting: false (not supported in workflow isolate)
   * - keepNames: true (preserves function names)
   */
  buildOptions?: Partial<esbuild.BuildOptions> | undefined;

  /**
   * List of plugins to register with the bundler.
   */
  plugins?: BundlerPlugin[] | undefined;

  /**
   * Optional logger for build output.
   */
  logger?: Logger | undefined;

  /**
   * If true, include metadata in the bundle output.
   * Default: true
   */
  report?: boolean | undefined;

  /**
   * Input flavor for cross-runtime support.
   * Allows bundling Deno or Bun-flavored TypeScript.
   * Default: 'auto'
   */
  inputFlavor?: InputFlavor | undefined;

  /**
   * Path to deno.json or deno.jsonc config file.
   * Used for import maps and compiler options.
   */
  denoConfigPath?: string | undefined;

  /**
   * Path to an import map file.
   * Takes precedence over import map in deno.json.
   */
  importMapPath?: string | undefined;
}

/**
 * Metadata embedded in the workflow bundle
 */
export interface BundleMetadata {
  /**
   * When the bundle was created (ISO 8601)
   */
  createdAt: string;

  /**
   * Build mode used
   */
  mode: 'development' | 'production';

  /**
   * Hash of the entrypoint content for cache invalidation
   */
  entryHash: string;

  /**
   * Version of the bundler
   */
  bundlerVersion: string;

  /**
   * Version of @temporalio/workflow used
   */
  temporalSdkVersion: string;

  /**
   * External modules (from ignoreModules)
   */
  externals?: string[] | undefined;

  /**
   * Build warnings
   */
  warnings?: string[] | undefined;
}

/**
 * Result of bundling workflow code
 */
export interface WorkflowBundle {
  /**
   * The bundled JavaScript code
   */
  code: string;

  /**
   * External source map if sourceMap: 'external' was specified
   */
  sourceMap?: string | undefined;

  /**
   * Bundle metadata for validation and debugging
   */
  metadata?: BundleMetadata | undefined;
}

/**
 * Result of bundle validation
 */
export interface ValidationResult {
  /**
   * Whether the bundle is valid
   */
  valid: boolean;

  /**
   * Error message if validation failed
   */
  error?: string | undefined;

  /**
   * Warnings that don't prevent the bundle from being used
   */
  warnings?: string[] | undefined;
}

/**
 * Determinism policy configuration
 */
export interface DeterminismPolicy {
  /**
   * Node.js builtins that are allowed (with Temporal stubs)
   */
  allowed: string[];

  /**
   * Modules that are forbidden in workflow code
   */
  forbidden: string[];
}

/**
 * Error codes for WorkflowBundleError
 */
export type WorkflowBundleErrorCode =
  | 'FORBIDDEN_MODULES'
  | 'DYNAMIC_IMPORT'
  | 'RESOLUTION_FAILED'
  | 'IGNORED_MODULE_USED'
  | 'CONFIG_INVALID'
  | 'BUILD_FAILED'
  | 'ENTRYPOINT_NOT_FOUND';

/**
 * Context for WorkflowBundleError
 */
export interface WorkflowBundleErrorContext {
  /**
   * Modules that caused the error
   */
  modules?: string[];

  /**
   * Additional details about the error
   */
  details?: string;

  /**
   * Actionable hint for fixing the error
   */
  hint?: string;

  /**
   * Dependency chain from entrypoint to problematic module
   */
  dependencyChain?: string[];

  /**
   * Configuration violations
   */
  violations?: string[];
}

/**
 * Input flavor for cross-runtime support.
 *
 * - 'node': Standard Node.js/npm imports (default)
 * - 'deno': Deno-style imports (URL imports, npm: specifiers, import maps)
 * - 'bun': Bun-style imports (similar to Node but with bun: builtins)
 * - 'auto': Auto-detect based on config files and import patterns
 */
export type InputFlavor = 'node' | 'deno' | 'bun' | 'auto';

/**
 * Import map structure (compatible with Deno and browsers).
 * See: https://deno.land/manual/basics/import_maps
 */
export interface ImportMap {
  /**
   * Direct module mappings.
   * Example: { "lodash": "npm:lodash@4.17.21" }
   */
  imports?: Record<string, string>;

  /**
   * Scoped mappings that only apply within certain paths.
   * Example: { "/src/": { "lodash": "./local-lodash.ts" } }
   */
  scopes?: Record<string, Record<string, string>>;
}

/**
 * Configuration for cross-runtime input support.
 */
export interface CrossRuntimeConfig {
  /**
   * Input flavor to use.
   * Default: 'auto'
   */
  inputFlavor?: InputFlavor | undefined;

  /**
   * Path to deno.json or deno.jsonc config file.
   * Used for import maps and compiler options.
   */
  denoConfigPath?: string | undefined;

  /**
   * Path to an import map file (import_map.json).
   * Takes precedence over import map in deno.json.
   */
  importMapPath?: string | undefined;

  /**
   * Directory for caching fetched URL imports.
   * Default: node_modules/.cache/temporal-bundler
   */
  urlCacheDir?: string | undefined;

  /**
   * Whether to allow URL imports.
   * Default: true for deno flavor, false otherwise
   */
  allowUrlImports?: boolean | undefined;

  /**
   * Whether to require pinned versions for URL imports.
   * Default: true (recommended for reproducibility)
   */
  requirePinnedUrls?: boolean | undefined;
}

/**
 * Cached URL import metadata for reproducibility.
 */
export interface UrlImportCache {
  /**
   * The original URL
   */
  url: string;

  /**
   * Local file path where the content is cached
   */
  localPath: string;

  /**
   * SHA-256 hash of the content for integrity verification
   */
  integrity: string;

  /**
   * When the URL was fetched
   */
  fetchedAt: string;

  /**
   * Content-Type from the response
   */
  contentType?: string | undefined;
}

/**
 * A reusable build context for repeated builds.
 *
 * This is useful for test suites where the same workflow bundle
 * needs to be rebuilt multiple times with the same configuration.
 * Using a context avoids the overhead of recreating esbuild contexts.
 */
export interface BundleContext {
  /**
   * Rebuild the bundle using the existing context.
   * Much faster than creating a new bundler for each build.
   */
  rebuild(): Promise<WorkflowBundle>;

  /**
   * Dispose of the context and free resources.
   * Must be called when done with the context.
   */
  dispose(): Promise<void>;
}

/**
 * Information about a single workflow in the bundle.
 */
export interface WorkflowInfo {
  /**
   * The export name of the workflow function.
   * This is the stable name used to identify the workflow type.
   */
  name: string;

  /**
   * Hash of the workflow function source for change detection.
   */
  sourceHash?: string;

  /**
   * Line number where the workflow is defined (for debugging).
   */
  line?: number;
}

/**
 * Manifest of workflow bundle contents.
 *
 * This manifest provides stable workflow names that survive minification,
 * and additional metadata useful for debugging and validation.
 */
export interface WorkflowManifest {
  /**
   * Schema version for future compatibility.
   */
  version: 1;

  /**
   * When the manifest was generated (ISO 8601).
   */
  generatedAt: string;

  /**
   * Hash of the bundle code for integrity checking.
   */
  bundleHash: string;

  /**
   * List of workflows exported by the bundle.
   */
  workflows: WorkflowInfo[];

  /**
   * SDK version used to build the bundle.
   */
  sdkVersion?: string;

  /**
   * Bundler version used.
   */
  bundlerVersion?: string;

  /**
   * Path to the workflow source file.
   */
  sourcePath?: string;
}
