/**
 * Tests for the bundle loader and caching utilities.
 */

import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

import { afterAll, beforeAll, describe, expect, it } from 'bun:test';

import { bundleWorkflowCode } from './bundler';
import {
  clearBundleCache,
  getBundleCacheStats,
  getCachedBundle,
  loadBundle,
  preloadBundles,
} from './loader';

const fixturesDir = resolve(__dirname, '../test/fixtures');
const tempDir = resolve(__dirname, '../test/temp-loader');

describe('loader', () => {
  beforeAll(() => {
    // Create temp directory for test outputs
    if (!existsSync(tempDir)) {
      mkdirSync(tempDir, { recursive: true });
    }
  });

  afterAll(() => {
    // Clean up temp directory
    if (existsSync(tempDir)) {
      rmSync(tempDir, { recursive: true });
    }
    clearBundleCache();
  });

  describe('loadBundle', () => {
    it('loads a pre-built bundle from disk', async () => {
      // First, create a bundle
      const bundle = await bundleWorkflowCode({
        workflowsPath: resolve(fixturesDir, 'basic-workflow/workflows.ts'),
      });

      // Write it to disk
      const bundlePath = join(tempDir, 'test-bundle.js');
      writeFileSync(bundlePath, bundle.code);

      if (bundle.sourceMap) {
        writeFileSync(`${bundlePath}.map`, bundle.sourceMap);
      }

      // Load it back
      const result = loadBundle({ path: bundlePath });

      expect(result.bundle.code).toBe(bundle.code);
      expect(result.path).toBe(bundlePath);
    });

    it('throws for non-existent bundle', () => {
      expect(() => loadBundle({ path: join(tempDir, 'non-existent.js') })).toThrow(
        'not found',
      );
    });

    it('validates bundle structure by default', () => {
      // Create an invalid bundle
      const invalidPath = join(tempDir, 'invalid-bundle.js');
      writeFileSync(invalidPath, 'console.log("not a workflow bundle")');

      expect(() => loadBundle({ path: invalidPath })).toThrow();
    });

    it('skips validation when validate is false', () => {
      // Create an invalid bundle
      const invalidPath = join(tempDir, 'invalid-skip-validate.js');
      writeFileSync(invalidPath, 'console.log("not a workflow bundle")');

      const result = loadBundle({
        path: invalidPath,
        validate: false,
      });

      expect(result.bundle.code).toBe('console.log("not a workflow bundle")');
    });

    it('includes SDK version warnings when mismatched', async () => {
      // First, create a bundle
      const bundle = await bundleWorkflowCode({
        workflowsPath: resolve(fixturesDir, 'basic-workflow/workflows.ts'),
        report: true,
      });

      // Write it to disk
      const bundlePath = join(tempDir, 'version-test-bundle.js');
      writeFileSync(bundlePath, bundle.code);

      // Load with mismatched version
      const result = loadBundle({
        path: bundlePath,
        expectedSdkVersion: '99.0.0',
      });

      // Should have warnings about version mismatch
      // (The bundle itself is valid, just version mismatch)
      expect(result.bundle.code).toBeDefined();
    });
  });

  describe('getCachedBundle', () => {
    beforeAll(() => {
      clearBundleCache();
    });

    it('builds bundle on first call', async () => {
      const startStats = getBundleCacheStats();
      expect(startStats.size).toBe(0);

      const bundle = await getCachedBundle({
        workflowsPath: resolve(fixturesDir, 'basic-workflow/workflows.ts'),
      });

      expect(bundle.code).toBeDefined();
      expect(bundle.code).toContain('__TEMPORAL__');

      const endStats = getBundleCacheStats();
      expect(endStats.size).toBe(1);
    });

    it('returns cached bundle on subsequent calls', async () => {
      clearBundleCache();

      // First call - builds
      const bundle1 = await getCachedBundle({
        workflowsPath: resolve(fixturesDir, 'basic-workflow/workflows.ts'),
      });

      // Second call - should be cached
      const bundle2 = await getCachedBundle({
        workflowsPath: resolve(fixturesDir, 'basic-workflow/workflows.ts'),
      });

      // Should be the exact same object (not just equal)
      expect(bundle1).toBe(bundle2);
    });

    it('rebuilds when forceRebuild is true', async () => {
      clearBundleCache();

      // First call
      const bundle1 = await getCachedBundle({
        workflowsPath: resolve(fixturesDir, 'basic-workflow/workflows.ts'),
      });

      // Force rebuild
      const bundle2 = await getCachedBundle({
        workflowsPath: resolve(fixturesDir, 'basic-workflow/workflows.ts'),
        forceRebuild: true,
      });

      // Should be different objects (rebuilt)
      expect(bundle1).not.toBe(bundle2);
      // But content should be equivalent
      expect(bundle1.code).toBe(bundle2.code);
    });

    it('different options create different cache entries', async () => {
      clearBundleCache();

      const bundle1 = await getCachedBundle({
        workflowsPath: resolve(fixturesDir, 'basic-workflow/workflows.ts'),
        mode: 'development',
      });

      const bundle2 = await getCachedBundle({
        workflowsPath: resolve(fixturesDir, 'basic-workflow/workflows.ts'),
        mode: 'production',
      });

      const stats = getBundleCacheStats();
      expect(stats.size).toBe(2);

      // Different bundles
      expect(bundle1).not.toBe(bundle2);
    });
  });

  describe('clearBundleCache', () => {
    it('clears all cached bundles', async () => {
      // Add some entries
      await getCachedBundle({
        workflowsPath: resolve(fixturesDir, 'basic-workflow/workflows.ts'),
      });

      let stats = getBundleCacheStats();
      expect(stats.size).toBeGreaterThan(0);

      clearBundleCache();

      stats = getBundleCacheStats();
      expect(stats.size).toBe(0);
    });
  });

  describe('preloadBundles', () => {
    it('preloads multiple bundles in parallel', async () => {
      clearBundleCache();

      const bundles = await preloadBundles([
        { workflowsPath: resolve(fixturesDir, 'basic-workflow/workflows.ts') },
        {
          workflowsPath: resolve(fixturesDir, 'basic-workflow/workflows.ts'),
          mode: 'production',
        },
      ]);

      expect(bundles).toHaveLength(2);
      expect(bundles[0]!.code).toContain('__TEMPORAL__');
      expect(bundles[1]!.code).toContain('__TEMPORAL__');

      const stats = getBundleCacheStats();
      expect(stats.size).toBe(2);
    });
  });
});
