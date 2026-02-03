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
  ActivityBundle,
  ActivityBundleOptions,
  BuildMetadata,
  BundleComparison,
  BundleContext,
  BundleMetadata,
  BundleOptions,
  BundlerPlugin,
  BundleSizeBudget,
  ContentHashOptions,
  CrossRuntimeConfig,
  DeterminismPolicy,
  DiskCacheOptions,
  ExportValidationResult,
  ExtendedBundlerPlugin,
  ImportMap,
  InputFlavor,
  InstrumentationOptions,
  Logger,
  ModuleSizeInfo,
  MultiBundleOptions,
  PackageBoundaries,
  QueueConfig,
  SdkCompatibility,
  SignedBundle,
  SizeAnalysisResult,
  TestBundleOptions,
  TypeCheckOptions,
  TypeValidationResult,
  UrlImportCache,
  ValidationOptions,
  ValidationResult,
  WatchCoordinatorOptions,
  WatchOptions,
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

// TypeScript path alias support
export type { TsconfigPaths, TsconfigPathsPluginOptions } from './tsconfig-paths';
export {
  createTsconfigPathsPlugin,
  findTsconfig,
  parseTsconfigPaths,
  resolvePathAlias,
} from './tsconfig-paths';

// ============================================================
// Phase 1: Core Infrastructure
// ============================================================

// Content hashing
export { computeBundleContentHash, hashFileContent } from './content-hash';

// Disk cache
export { createDiskCache, DiskCache } from './disk-cache';

// ============================================================
// Phase 2: Multi-Workflow Orchestration
// ============================================================

// Multi-bundle
export { bundleMultipleWorkflows, createMultiBundlers } from './multi-bundle';

// Activity bundling
export { bundleActivityCode } from './activity-bundler';

// Coordinated watch mode
export type { CoordinatedWatchHandle } from './watch-coordinator';
export { watchTemporalCode } from './watch-coordinator';

// ============================================================
// Phase 3: Bundle Size Analysis
// ============================================================

// Size analysis
export { analyzeSize, formatBytes, parseSize } from './size-analysis';

// Bundle comparison
export { compareBundle, formatComparison } from './bundle-comparison';

// ============================================================
// Phase 4: Enhanced Determinism Checking
// ============================================================

// Violation mapping
export type { MappedViolation } from './violation-mapper';
export { formatMappedViolations, mapViolationsToSource } from './violation-mapper';

// Alternatives
export type { Alternative } from './alternatives';
export {
  FORBIDDEN_ALTERNATIVES,
  formatAlternative,
  getAlternative,
  listAlternatives,
} from './alternatives';

// History analysis
export type { HistoryAnalysisResult, HistoryWarning } from './history-analysis';
export { analyzeFileHistorySize, analyzeHistorySize } from './history-analysis';

// ============================================================
// Phase 5: Workflow Validation
// ============================================================

// Export validation
export {
  validateWorkflowExports,
  validateWorkflowExportsFromSource,
} from './export-validation';

// Activity type validation
export { validateActivityTypes, validateActivityTypesFromSource } from './activity-types';

// Boundary enforcement
export type { BoundaryCheckResult, BoundaryViolation } from './boundary-enforcement';
export {
  checkActivityBoundaries,
  checkBoundariesFromSource,
  checkWorkflowBoundaries,
  DEFAULT_BOUNDARIES,
} from './boundary-enforcement';

// ============================================================
// Phase 6: Source Maps & CI/CD
// ============================================================

// Source map utilities
export type {
  SourceMapRemapOptions,
  SourceMapUploadData,
  SourceMapUploadOptions,
} from './sourcemap-utils';
export {
  remapSourceMapFile,
  remapSourceMapPaths,
  uploadSourceMap,
} from './sourcemap-utils';

// CI output
export type { CIReport } from './ci-output';
export {
  formatCIReportText,
  formatGitHubAnnotations,
  generateCIReport,
} from './ci-output';

// Determinism verification
export type { DeterminismVerifyResult } from './determinism-verify';
export { verifyDeterministicBuild } from './determinism-verify';

// ============================================================
// Phase 7: Plugin System Enhancements
// ============================================================

// Plugin utilities
export type { ComposedPlugins } from './plugin-utils';
export {
  composePlugins,
  createEsbuildPluginAdapter,
  createPlugin,
  mergePlugins,
  sortPluginsByPriority,
} from './plugin-utils';

// Tree shaking
export type { PreserveExportsOptions } from './tree-shaking';
export { analyzeRequiredExports, createPreserveExportsPlugin } from './tree-shaking';

// ============================================================
// Phase 8: TypeScript Integration
// ============================================================

// Type checking
export type { TypeCheckDiagnostic, TypeCheckResult } from './typescript-check';
export { typeCheckWorkflows } from './typescript-check';

// Declaration generation
export {
  generateDeclarationContent,
  generateWorkflowDeclarations,
} from './dts-generator';

// ============================================================
// Phase 9: SDK Compatibility
// ============================================================

// SDK compatibility
export { checkSdkCompatibility, formatCompatibilityInfo } from './sdk-compat';

// Instrumentation
export {
  createInstrumentationPlugin,
  generateActivityTracing,
  generateWorkflowTracing,
} from './instrumentation';

// ============================================================
// Phase 10: Watch Mode Improvements
// ============================================================

// Test mode bundling
export { bundleForTesting } from './test-mode';

// ============================================================
// Phase 11: Bundle Signing
// ============================================================

// Signing
export type { SigningKeyPair } from './signing';
export {
  generateSigningKeyPair,
  signBundle,
  verifyBundle,
  verifyBundleWithKey,
} from './signing';
