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
export { bundleWorkflowCode, createConsoleLogger, WorkflowCodeBundler } from './bundler';

// Errors
export { WorkflowBundleError } from './errors';

// Types
export type {
  BundleMetadata,
  BundleOptions,
  BundlerPlugin,
  DeterminismPolicy,
  Logger,
  ValidationResult,
  WorkflowBundle,
  WorkflowBundleErrorCode,
  WorkflowBundleErrorContext,
} from './types';

// Validation
export { validateBundle, validateBundleStructure } from './validate';

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
