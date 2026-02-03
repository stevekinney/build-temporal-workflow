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
   * Enable esbuild tree shaking to eliminate unused code from dependencies.
   *
   * All workflow exports are preserved regardless of this setting because
   * the synthetic entrypoint requires the entire workflow module.
   * Tree shaking only removes dead code in transitive dependencies.
   *
   * Default: true
   */
  treeShaking?: boolean | undefined;

  /**
   * Additional esbuild options to merge with the bundler defaults.
   *
   * Note: Some options are enforced and cannot be overridden:
   * - bundle: true
   * - format: 'cjs'
   * - minify: false (breaks workflow type names)
   * - splitting: false (not supported in workflow isolate)
   * - keepNames: true (preserves function names)
   */
  buildOptions?: Partial<esbuild.BuildOptions> | undefined;

  /**
   * Which bundler backend to use.
   * - 'esbuild': Always use esbuild (works on Node and Bun)
   * - 'bun': Always use Bun.build (requires Bun runtime)
   * - 'auto': Use esbuild (default, best plugin compatibility)
   * Default: 'auto'
   */
  bundler?: 'esbuild' | 'bun' | 'auto' | undefined;

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

  /**
   * Path to tsconfig.json for resolving TypeScript path aliases.
   *
   * When set to `true`, automatically searches for tsconfig.json
   * near the workflowsPath. When set to a string, uses that specific
   * tsconfig.json file.
   *
   * Path aliases like `@/*` mapping to `./src/*` will be resolved
   * during bundling.
   *
   * Default: undefined (no automatic tsconfig paths resolution)
   */
  tsconfigPath?: string | boolean | undefined;
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

  /**
   * Extended build metadata (git commit, CI, runtime version, etc.)
   */
  buildMetadata?: BuildMetadata | undefined;
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

// ============================================================
// Phase 1: Core Infrastructure
// ============================================================

/**
 * Options for the persistent disk cache.
 */
export interface DiskCacheOptions {
  /**
   * Directory for storing cached bundles.
   * Default: node_modules/.cache/temporal-bundler
   */
  cacheDir?: string;

  /**
   * Maximum age of cache entries in milliseconds.
   * Default: 7 days (604800000)
   */
  maxAge?: number;

  /**
   * Maximum total cache size in bytes.
   * Default: 100MB (104857600)
   */
  maxSize?: number;
}

/**
 * Options for computing a content hash of all bundle inputs.
 */
export interface ContentHashOptions {
  /**
   * Whether to include node_modules in the hash.
   * Default: false
   */
  includeNodeModules?: boolean;

  /**
   * File extensions to include in the hash.
   * Default: ['.ts', '.tsx', '.js', '.jsx', '.mts', '.cts', '.mjs', '.cjs']
   */
  extensions?: string[];
}

/**
 * Build metadata embedded in the bundle for tracing and debugging.
 */
export interface BuildMetadata {
  /**
   * Git commit hash (if available).
   */
  gitCommit?: string;

  /**
   * Git branch name (if available).
   */
  gitBranch?: string;

  /**
   * When the build was performed (ISO 8601).
   */
  buildTime: string;

  /**
   * The CI environment name (e.g., 'github-actions', 'gitlab-ci').
   */
  ci?: string;

  /**
   * The Node.js/Bun version used for the build.
   */
  runtimeVersion: string;

  /**
   * Content hash of all input files.
   */
  contentHash?: string;
}

// ============================================================
// Phase 2: Multi-Workflow Orchestration
// ============================================================

/**
 * Configuration for a single task queue's workflow bundle.
 */
export interface QueueConfig {
  /**
   * Name of the task queue.
   */
  name: string;

  /**
   * Path to workflow source file or directory.
   */
  workflowsPath: string;

  /**
   * Path to activities source file or directory (optional).
   */
  activitiesPath?: string;
}

/**
 * Options for bundling multiple workflows across task queues.
 */
export interface MultiBundleOptions {
  /**
   * List of queue configurations to bundle.
   */
  queues: QueueConfig[];

  /**
   * Shared configuration applied to all queues.
   */
  shared?: {
    tsconfigPath?: string;
    plugins?: BundlerPlugin[];
    mode?: 'development' | 'production';
    sourceMap?: 'inline' | 'external' | 'none';
    ignoreModules?: string[];
    logger?: Logger;
  };
}

/**
 * Options for bundling activity code.
 */
export interface ActivityBundleOptions {
  /**
   * Path to activities source file or directory.
   */
  activitiesPath: string;

  /**
   * Output format for the activity bundle.
   * Default: 'esm'
   */
  format?: 'esm' | 'cjs';

  /**
   * Whether to minify the activity bundle.
   * Default: false
   */
  minify?: boolean;

  /**
   * External packages to exclude from the bundle.
   */
  external?: string[];

  /**
   * Optional logger.
   */
  logger?: Logger;
}

/**
 * Result of bundling activity code.
 */
export interface ActivityBundle {
  /**
   * The bundled JavaScript code.
   */
  code: string;

  /**
   * Source map (if generated).
   */
  sourceMap?: string;

  /**
   * List of exported activity function names.
   */
  activityNames: string[];
}

/**
 * Options for coordinated watch mode across workflows and activities.
 */
export interface WatchCoordinatorOptions {
  /**
   * Queue configurations to watch.
   */
  queues: QueueConfig[];

  /**
   * Shared configuration.
   */
  shared?: MultiBundleOptions['shared'];

  /**
   * Debounce interval in milliseconds.
   * Default: 100
   */
  debounce?: number;

  /**
   * Callback invoked when any bundle is rebuilt.
   */
  onChange: (
    queueName: string,
    type: 'workflow' | 'activity',
    bundle: WorkflowBundle | ActivityBundle | null,
    error?: Error,
  ) => void;
}

// ============================================================
// Phase 3: Bundle Size Analysis
// ============================================================

/**
 * Size budget constraints for bundle validation.
 */
export interface BundleSizeBudget {
  /**
   * Maximum total bundle size in bytes.
   */
  total?: number;

  /**
   * Maximum size per module in bytes.
   */
  perModule?: number;

  /**
   * Warning threshold as a percentage of budget (0-100).
   * Default: 80
   */
  warn?: number;

  /**
   * Failure threshold as a percentage of budget (0-100).
   * Default: 100
   */
  fail?: number;
}

/**
 * Size information for a single module in the bundle.
 */
export interface ModuleSizeInfo {
  /**
   * Module path.
   */
  path: string;

  /**
   * Size in bytes.
   */
  size: number;

  /**
   * Percentage of total bundle size.
   */
  percentage: number;

  /**
   * Whether this module is from node_modules.
   */
  isExternal: boolean;
}

/**
 * Result of bundle size analysis.
 */
export interface SizeAnalysisResult {
  /**
   * Total bundle size in bytes.
   */
  totalSize: number;

  /**
   * Total gzipped size estimate in bytes.
   */
  gzipSize: number;

  /**
   * Number of modules in the bundle.
   */
  moduleCount: number;

  /**
   * Size breakdown by module, sorted by size descending.
   */
  modules: ModuleSizeInfo[];

  /**
   * Top contributors to bundle size.
   */
  topContributors: ModuleSizeInfo[];

  /**
   * Budget check results (if budget was provided).
   */
  budgetResult?: {
    status: 'pass' | 'warn' | 'fail';
    message: string;
    overBudget?: number;
  };
}

/**
 * Result of comparing two bundles.
 */
export interface BundleComparison {
  /**
   * Previous bundle size in bytes.
   */
  previousSize: number;

  /**
   * Current bundle size in bytes.
   */
  currentSize: number;

  /**
   * Size difference in bytes (positive = larger).
   */
  delta: number;

  /**
   * Percentage change.
   */
  deltaPercentage: number;

  /**
   * Modules that were added.
   */
  added: ModuleSizeInfo[];

  /**
   * Modules that were removed.
   */
  removed: ModuleSizeInfo[];

  /**
   * Modules that changed in size.
   */
  changed: Array<{
    path: string;
    previousSize: number;
    currentSize: number;
    delta: number;
  }>;
}

// ============================================================
// Phase 5: Workflow Validation
// ============================================================

/**
 * Options for workflow export validation.
 */
export interface ValidationOptions {
  /**
   * Whether to require workflow functions to have explicit return types.
   * Default: false
   */
  requireReturnTypes?: boolean;

  /**
   * Whether to validate that all exports are async functions.
   * Default: true
   */
  requireAsync?: boolean;

  /**
   * Custom patterns for workflow function name validation.
   */
  namePattern?: RegExp;
}

/**
 * Result of workflow export validation.
 */
export interface ExportValidationResult {
  /**
   * Whether all exports are valid.
   */
  valid: boolean;

  /**
   * List of export names found.
   */
  exports: string[];

  /**
   * Validation errors.
   */
  errors: Array<{
    exportName: string;
    message: string;
  }>;

  /**
   * Validation warnings.
   */
  warnings: Array<{
    exportName: string;
    message: string;
  }>;
}

/**
 * Result of activity type validation.
 */
export interface TypeValidationResult {
  /**
   * Whether all activity types are valid.
   */
  valid: boolean;

  /**
   * List of validated activities.
   */
  activities: Array<{
    name: string;
    valid: boolean;
    errors: string[];
  }>;
}

/**
 * Package boundary rules for workflow/activity separation.
 */
export interface PackageBoundaries {
  /**
   * Packages that can only be used in workflow code.
   */
  workflowOnly: string[];

  /**
   * Packages that can only be used in activity code.
   */
  activityOnly: string[];

  /**
   * Packages that can be used in both workflow and activity code.
   */
  shared: string[];
}

// ============================================================
// Phase 7: Plugin System Enhancements
// ============================================================

/**
 * Extended plugin interface with priority ordering.
 */
export interface ExtendedBundlerPlugin extends BundlerPlugin {
  /**
   * Priority for plugin ordering. Lower values run first.
   * Default: 100
   */
  priority?: number;
}

// ============================================================
// Phase 8: TypeScript Integration
// ============================================================

/**
 * Options for TypeScript type checking during build.
 */
export interface TypeCheckOptions {
  /**
   * Whether to enable type checking.
   * Default: false
   */
  enabled?: boolean;

  /**
   * Whether to use strict mode.
   * Default: false
   */
  strict?: boolean;

  /**
   * Whether to enforce workflow-specific type rules.
   * Default: false
   */
  workflowRules?: boolean;
}

// ============================================================
// Phase 9: SDK Compatibility
// ============================================================

/**
 * SDK version compatibility information.
 */
export interface SdkCompatibility {
  /**
   * Bundler version.
   */
  bundlerVersion: string;

  /**
   * SDK version used during bundling.
   */
  bundleSdkVersion: string;

  /**
   * SDK version of the worker.
   */
  workerSdkVersion: string;

  /**
   * Whether the versions are compatible.
   */
  compatible: boolean;

  /**
   * Compatibility warnings.
   */
  warnings: string[];
}

/**
 * Options for development-mode instrumentation.
 */
export interface InstrumentationOptions {
  /**
   * Whether to trace workflow function calls.
   * Default: false
   */
  traceWorkflowCalls?: boolean;

  /**
   * Whether to trace activity proxy calls.
   * Default: false
   */
  traceActivityCalls?: boolean;

  /**
   * Whether to remove instrumentation in production builds.
   * Default: true
   */
  treeShakeInProduction?: boolean;
}

// ============================================================
// Phase 10: Watch Mode Improvements
// ============================================================

/**
 * Options for watch mode behavior.
 */
export interface WatchOptions {
  /**
   * Debounce interval in milliseconds.
   * Default: 100
   */
  debounce?: number;
}

/**
 * Options for test-specific bundle configuration.
 */
export interface TestBundleOptions extends BundleOptions {
  /**
   * Module replacements for testing (module path -> mock path).
   */
  mocks?: Record<string, string>;

  /**
   * Whether to allow some non-deterministic patterns in test mode.
   * Default: false
   */
  relaxedDeterminism?: boolean;
}

// ============================================================
// Phase 11: Bundle Signing
// ============================================================

/**
 * A workflow bundle with an Ed25519 signature.
 */
export interface SignedBundle extends WorkflowBundle {
  /**
   * Base64-encoded Ed25519 signature.
   */
  signature: string;

  /**
   * Base64-encoded public key for verification.
   */
  publicKey: string;
}
