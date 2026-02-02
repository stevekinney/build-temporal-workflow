/**
 * Helpers for loading and caching workflow bundles.
 *
 * These utilities simplify Worker integration with pre-built bundles
 * and provide caching for faster test execution.
 */

import { existsSync, readFileSync, statSync } from 'node:fs';
import { resolve } from 'node:path';

import { bundleWorkflowCode } from './bundler';
import { WorkflowBundleError } from './errors';
import type { BundleOptions, WorkflowBundle } from './types';
import { validateBundle, validateBundleStructure } from './validate';

/**
 * Options for loading a pre-built bundle.
 */
export interface LoadBundleOptions {
  /**
   * Path to the bundle file (.js).
   */
  path: string;

  /**
   * Path to source map file (.js.map). Optional.
   * If not provided, looks for {path}.map
   */
  sourceMapPath?: string;

  /**
   * Whether to validate the bundle structure.
   * Default: true
   */
  validate?: boolean;

  /**
   * Expected SDK version for validation.
   * If provided, warns if bundle was built with different version.
   */
  expectedSdkVersion?: string;
}

/**
 * Result of loading a bundle, including validation info.
 */
export interface LoadBundleResult {
  /**
   * The loaded bundle.
   */
  bundle: WorkflowBundle;

  /**
   * Validation warnings (if any).
   */
  warnings?: string[] | undefined;

  /**
   * Path the bundle was loaded from.
   */
  path: string;
}

/**
 * Load a pre-built workflow bundle from disk.
 *
 * Use this when you've pre-built your bundle (e.g., in CI) and want to
 * load it at worker startup time without rebuilding.
 *
 * @example
 * ```typescript
 * import { loadBundle } from 'bundle-temporal-workflow';
 *
 * const { bundle, warnings } = await loadBundle({
 *   path: './dist/workflow-bundle.js',
 *   expectedSdkVersion: '1.14.0',
 * });
 *
 * if (warnings?.length) {
 *   console.warn('Bundle warnings:', warnings);
 * }
 *
 * const worker = await Worker.create({
 *   workflowBundle: bundle,
 *   taskQueue: 'my-queue',
 * });
 * ```
 */
export function loadBundle(options: LoadBundleOptions): LoadBundleResult {
  const bundlePath = resolve(options.path);

  // Check bundle exists
  if (!existsSync(bundlePath)) {
    throw new WorkflowBundleError('ENTRYPOINT_NOT_FOUND', {
      details: `Bundle file not found: ${bundlePath}`,
    });
  }

  // Read bundle code
  const code = readFileSync(bundlePath, 'utf-8');

  // Try to read source map
  let sourceMap: string | undefined;
  const mapPath = options.sourceMapPath
    ? resolve(options.sourceMapPath)
    : `${bundlePath}.map`;

  if (existsSync(mapPath)) {
    sourceMap = readFileSync(mapPath, 'utf-8');
  }

  // Try to read metadata (stored as JSON comment at start of bundle)
  const metadata = extractMetadataFromBundle(code);

  const bundle: WorkflowBundle = {
    code,
    sourceMap,
    metadata,
  };

  const allWarnings: string[] = [];

  // Validate structure if requested
  if (options.validate !== false) {
    const structureResult = validateBundleStructure(code);
    if (!structureResult.valid) {
      throw new WorkflowBundleError('BUILD_FAILED', {
        details: structureResult.error ?? 'Invalid bundle structure',
      });
    }
    if (structureResult.warnings) {
      allWarnings.push(...structureResult.warnings);
    }
  }

  // Validate SDK version if provided
  if (options.expectedSdkVersion) {
    const versionResult = validateBundle(bundle, {
      workerVersion: options.expectedSdkVersion,
    });
    if (versionResult.warnings) {
      allWarnings.push(...versionResult.warnings);
    }
  }

  return {
    bundle,
    warnings: allWarnings.length > 0 ? allWarnings : undefined,
    path: bundlePath,
  };
}

/**
 * Extract metadata from a bundle's code comment (if present).
 */
function extractMetadataFromBundle(code: string): WorkflowBundle['metadata'] | undefined {
  // Look for metadata comment pattern at start of bundle
  const metadataMatch = code.match(
    /\/\*\s*__TEMPORAL_BUNDLE_METADATA__\s*([\s\S]*?)\s*\*\//,
  );

  if (!metadataMatch?.[1]) {
    return undefined;
  }

  try {
    return JSON.parse(metadataMatch[1]) as WorkflowBundle['metadata'];
  } catch {
    return undefined;
  }
}

/**
 * In-memory cache for workflow bundles.
 */
interface BundleCacheEntry {
  bundle: WorkflowBundle;
  hash: string;
  timestamp: number;
}

const bundleCache = new Map<string, BundleCacheEntry>();

/**
 * Generate a cache key from bundle options.
 */
function getCacheKey(options: BundleOptions): string {
  const parts = [
    options.workflowsPath,
    options.mode ?? 'development',
    options.sourceMap ?? 'inline',
    ...(options.ignoreModules ?? []).sort(),
    ...(options.workflowInterceptorModules ?? []).sort(),
    options.payloadConverterPath ?? '',
    options.failureConverterPath ?? '',
  ];
  return parts.join('|');
}

/**
 * Generate a hash of the workflow file(s) for cache invalidation.
 *
 * @param workflowsPath - Path to the workflow file or directory
 * @param useContentHash - If true, compute a hash of the file content instead of using mtime.
 *                         More reliable but slower. Recommended for CI environments.
 */
function getFileHash(workflowsPath: string, useContentHash = false): string {
  const resolvedPath = resolve(workflowsPath);

  if (!existsSync(resolvedPath)) {
    return 'not-found';
  }

  const stat = statSync(resolvedPath);

  // Use content hash for more reliable cache invalidation
  if (useContentHash && stat.isFile()) {
    const content = readFileSync(resolvedPath);
    // Use Bun's fast hash function
    return Bun.hash(content).toString(16);
  }

  // Use mtime as a simple hash (faster, but less reliable across file systems)
  return `${stat.mtime.getTime()}:${stat.size}`;
}

/**
 * Options for getCachedBundle.
 */
export interface GetCachedBundleOptions extends BundleOptions {
  /**
   * Force rebuild even if cache is valid.
   * Default: false
   */
  forceRebuild?: boolean;

  /**
   * Use content-based hashing for cache invalidation.
   * More reliable than mtime-based hashing but slightly slower.
   * Recommended for CI environments where mtime may not be reliable.
   * Default: false
   */
  useContentHash?: boolean;
}

/**
 * Get a workflow bundle, using cache when possible.
 *
 * This is particularly useful in test suites where the same workflow bundle
 * is needed for multiple tests. Without caching, each test would pay the
 * 2.5-3 second bundling cost.
 *
 * The cache is invalidated when:
 * - The workflow file's mtime changes
 * - Bundle options change
 * - forceRebuild is set to true
 *
 * @example
 * ```typescript
 * import { getCachedBundle } from 'bundle-temporal-workflow';
 *
 * describe('My Workflow Tests', () => {
 *   let bundle: WorkflowBundle;
 *
 *   beforeAll(async () => {
 *     // First call builds the bundle
 *     bundle = await getCachedBundle({
 *       workflowsPath: require.resolve('./workflows'),
 *     });
 *   });
 *
 *   it('test 1', async () => {
 *     const worker = await Worker.create({
 *       workflowBundle: bundle,
 *       taskQueue: 'test-queue-1',
 *     });
 *     // ...
 *   });
 *
 *   it('test 2', async () => {
 *     const worker = await Worker.create({
 *       workflowBundle: bundle, // Same bundle, no rebuild
 *       taskQueue: 'test-queue-2',
 *     });
 *     // ...
 *   });
 * });
 * ```
 *
 * For multiple test files sharing the same bundle:
 *
 * @example
 * ```typescript
 * // test/helpers/bundle.ts
 * import { getCachedBundle } from 'bundle-temporal-workflow';
 *
 * export async function getTestBundle() {
 *   return getCachedBundle({
 *     workflowsPath: require.resolve('../workflows'),
 *   });
 * }
 *
 * // test/workflow-a.test.ts
 * import { getTestBundle } from './helpers/bundle';
 *
 * const bundle = await getTestBundle(); // Builds on first test file
 *
 * // test/workflow-b.test.ts
 * import { getTestBundle } from './helpers/bundle';
 *
 * const bundle = await getTestBundle(); // Uses cache from first file
 * ```
 */
export async function getCachedBundle(
  options: GetCachedBundleOptions,
): Promise<WorkflowBundle> {
  const cacheKey = getCacheKey(options);
  const fileHash = getFileHash(options.workflowsPath, options.useContentHash);

  // Check cache
  if (!options.forceRebuild) {
    const cached = bundleCache.get(cacheKey);
    if (cached && cached.hash === fileHash) {
      return cached.bundle;
    }
  }

  // Build bundle
  const bundle = await bundleWorkflowCode(options);

  // Store in cache
  bundleCache.set(cacheKey, {
    bundle,
    hash: fileHash,
    timestamp: Date.now(),
  });

  return bundle;
}

/**
 * Clear the bundle cache.
 *
 * Useful for testing or when you want to force a fresh build.
 */
export function clearBundleCache(): void {
  bundleCache.clear();
}

/**
 * Get cache statistics.
 */
export function getBundleCacheStats(): {
  size: number;
  entries: Array<{
    key: string;
    age: number;
    hash: string;
  }>;
} {
  const now = Date.now();
  const entries: Array<{ key: string; age: number; hash: string }> = [];

  for (const [key, entry] of bundleCache) {
    entries.push({
      key,
      age: now - entry.timestamp,
      hash: entry.hash,
    });
  }

  return {
    size: bundleCache.size,
    entries,
  };
}

/**
 * Preload bundles into the cache.
 *
 * Useful for warming up the cache before running tests.
 *
 * @example
 * ```typescript
 * import { preloadBundles } from 'bundle-temporal-workflow';
 *
 * // In test setup
 * await preloadBundles([
 *   { workflowsPath: './src/workflows/order.ts' },
 *   { workflowsPath: './src/workflows/user.ts' },
 *   { workflowsPath: './src/workflows/notification.ts' },
 * ]);
 * ```
 */
export async function preloadBundles(
  optionsList: BundleOptions[],
): Promise<WorkflowBundle[]> {
  return Promise.all(optionsList.map((opts) => getCachedBundle(opts)));
}
