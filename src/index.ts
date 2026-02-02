/**
 * Temporal Workflow Bundler
 *
 * A faster alternative to @temporalio/worker's bundleWorkflowCode that uses
 * esbuild instead of Webpack for 10-100x faster builds.
 *
 * @example
 * ```typescript
 * import { bundleWorkflowCode } from 'bundle-temporal-workflow';
 *
 * const bundle = await bundleWorkflowCode({
 *   workflowsPath: require.resolve('./workflows'),
 * });
 *
 * const worker = await Worker.create({
 *   workflowBundle: bundle,
 *   taskQueue: 'my-task-queue',
 *   // ...
 * });
 * ```
 *
 * @module
 */

// Main API
export type { WatchCallback, WatchHandle } from './bundler';
export {
  bundleWorkflowCode,
  createConsoleLogger,
  watchWorkflowCode,
  WorkflowCodeBundler,
} from './bundler';

// Bundle loading and caching
export type {
  GetCachedBundleOptions,
  LoadBundleOptions,
  LoadBundleResult,
} from './loader';
export {
  clearBundleCache,
  getBundleCacheStats,
  getCachedBundle,
  loadBundle,
  preloadBundles,
} from './loader';

// Errors
export { WorkflowBundleError } from './errors';

// Types
export type {
  BundleContext,
  BundleMetadata,
  BundleOptions,
  BundlerPlugin,
  CrossRuntimeConfig,
  DeterminismPolicy,
  ImportMap,
  InputFlavor,
  Logger,
  UrlImportCache,
  ValidationResult,
  WorkflowBundle,
  WorkflowBundleErrorCode,
  WorkflowBundleErrorContext,
  WorkflowInfo,
  WorkflowManifest,
} from './types';

// Validation
export type { EnhancedValidationResult, ValidateBundleOptions } from './validate';
export {
  validateBundle,
  validateBundleDetailed,
  validateBundleStructure,
} from './validate';

// Manifest generation
export type { GenerateManifestOptions, ManifestDiff } from './manifest';
export {
  compareManifests,
  generateManifest,
  parseManifest,
  serializeManifest,
} from './manifest';

// Replay safety analysis
export type {
  AnalyzeReplaySafetyOptions,
  ReplaySafetyResult,
  ReplayUnsafePattern,
  ReplayViolation,
} from './replay-safety';
export {
  analyzeFileReplaySafety,
  analyzeReplaySafety,
  formatReplayViolations,
  REPLAY_UNSAFE_PATTERNS,
} from './replay-safety';

// Policy (for advanced usage)
export {
  ALLOWED_BUILTINS,
  getModuleOverridePath,
  isAllowedBuiltin,
  isForbidden,
  loadDeterminismPolicy,
  moduleMatches,
  normalizeSpecifier,
} from './policy';

// Plugin creation (for advanced usage)
export { createTemporalPlugin } from './esbuild-plugin';

// Dependency chain analysis (for debugging)
export {
  findAllDependencyChains,
  findDependencyChain,
  formatDependencyChain,
  summarizeDependencyChain,
} from './dependency-chain';

// Cross-runtime support (for Deno/Bun input)
export {
  createCrossRuntimePlugin,
  detectForbiddenRuntimeApis,
  detectInputFlavor,
  isNpmSpecifier,
  isUrlImport,
  isUrlPinned,
  loadImportMap,
  parseDenoConfig,
  parseImportMap,
  parseNpmSpecifier,
  resolveCrossRuntimeConfig,
} from './cross-runtime';
