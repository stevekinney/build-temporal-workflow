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
