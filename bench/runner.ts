/**
 * Main benchmark runner.
 */

import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { createBunAdapter, createEsbuildAdapter, createWebpackAdapter } from './adapters';
import type {
  BenchmarkMeasurement,
  BenchmarkResult,
  BenchmarkSuite,
  BundlerAdapter,
  BundlerComparison,
  FixtureConfig,
  RunnerOptions,
} from './types';
import { captureEnvironment } from './utils/environment';
import {
  calculateCpuDelta,
  createGCObserver,
  getCpuUsage,
  getHeapUsed,
  waitForGCStabilization,
} from './utils/memory';
import { calculateExtendedStats, cohensD, welchTTest } from './utils/stats';
import { clearBenchmarkMarks, createBenchmarkMarker } from './utils/timing';

/**
 * Default fixtures to benchmark.
 */
const DEFAULT_FIXTURES: FixtureConfig[] = [
  {
    name: 'small',
    workflowsPath: join(
      dirname(fileURLToPath(import.meta.url)),
      'fixtures/small/workflows.ts',
    ),
    description: 'Small fixture (~5 modules, baseline)',
  },
  {
    name: 'medium',
    workflowsPath: join(
      dirname(fileURLToPath(import.meta.url)),
      'fixtures/medium/workflows.ts',
    ),
    description: 'Medium fixture (~20 modules, realistic)',
  },
  {
    name: 'large',
    workflowsPath: join(
      dirname(fileURLToPath(import.meta.url)),
      'fixtures/large/workflows.ts',
    ),
    description: 'Large fixture (~50+ modules, stress test)',
  },
  {
    name: 'heavy-deps',
    workflowsPath: join(
      dirname(fileURLToPath(import.meta.url)),
      'fixtures/heavy-deps/workflows.ts',
    ),
    description: 'Heavy dependencies fixture',
  },
];

/**
 * Default bundler adapters.
 */
function getDefaultBundlers(): BundlerAdapter[] {
  const bundlers: BundlerAdapter[] = [createEsbuildAdapter(), createWebpackAdapter()];
  // Include Bun adapter when running under Bun
  if (typeof globalThis.Bun?.build === 'function') {
    bundlers.push(createBunAdapter());
  }
  return bundlers;
}

/**
 * Run a single benchmark iteration.
 */
async function runIteration(
  adapter: BundlerAdapter,
  workflowsPath: string,
  iterationName?: string,
): Promise<BenchmarkMeasurement> {
  // Wait for GC to stabilize before measurement
  await waitForGCStabilization(3, 0.05);

  const startMemory = getHeapUsed();
  let peakMemory = startMemory;

  // Track peak memory during execution with high-frequency sampling
  const memoryInterval = setInterval(() => {
    const current = getHeapUsed();
    if (current > peakMemory) {
      peakMemory = current;
    }
  }, 1);

  // Set up GC observer
  const gcObserver = createGCObserver();
  gcObserver.start();

  // Get CPU usage at start
  const startCpu = getCpuUsage();

  // Create benchmark marker for User Timing API
  const marker = createBenchmarkMarker(iterationName ?? `benchmark-${Date.now()}`);
  marker.start();

  const startTime = performance.now();

  // Run the bundler
  let output;
  try {
    output = await adapter.bundle(workflowsPath);
  } finally {
    clearInterval(memoryInterval);
  }

  const endTime = performance.now();
  marker.end();

  // Get CPU usage at end
  const endCpu = getCpuUsage();
  const cpuDelta = calculateCpuDelta(startCpu, endCpu);

  // Stop GC observer
  const gcMetrics = gcObserver.stop();

  // Check final memory as well
  const endMemory = getHeapUsed();
  if (endMemory > peakMemory) {
    peakMemory = endMemory;
  }

  // Use peak memory delta (more reliable than end-start which can be negative after GC)
  const memoryUsed = peakMemory - startMemory;

  return {
    timeMs: endTime - startTime,
    memoryBytes: Math.max(0, memoryUsed),
    bundleSize: output.size,
    cpuUser: cpuDelta.user,
    cpuSystem: cpuDelta.system,
    gcTimeMs: gcMetrics.totalTimeMs,
    gcCount: gcMetrics.count,
  };
}

/**
 * Run benchmark for a single fixture/bundler combination.
 */
async function benchmarkFixture(
  fixture: FixtureConfig,
  adapter: BundlerAdapter,
  runs: number,
  warmup: number,
  verbose: boolean,
  filterOutliers: boolean,
): Promise<BenchmarkResult> {
  // Clear any existing benchmark marks
  clearBenchmarkMarks();

  if (verbose) {
    console.log(`  ${adapter.name}: warming up (${warmup} runs)...`);
  }

  // Warmup runs (discarded)
  for (let i = 0; i < warmup; i++) {
    try {
      await runIteration(
        adapter,
        fixture.workflowsPath,
        `warmup-${fixture.name}-${adapter.name}-${i}`,
      );
    } catch (error) {
      // Warmup failure is acceptable, continue
      if (verbose) {
        console.log(`    Warmup ${i + 1} failed: ${error}`);
      }
    }
  }

  if (verbose) {
    console.log(`  ${adapter.name}: measuring ${runs} runs...`);
  }

  // Measured runs
  const measurements: BenchmarkMeasurement[] = [];

  for (let i = 0; i < runs; i++) {
    try {
      const measurement = await runIteration(
        adapter,
        fixture.workflowsPath,
        `run-${fixture.name}-${adapter.name}-${i}`,
      );
      measurements.push(measurement);

      if (verbose) {
        console.log(`    Run ${i + 1}: ${measurement.timeMs.toFixed(2)}ms`);
      }
    } catch (error) {
      // If any run fails, record it and stop
      const errorMessage = error instanceof Error ? error.message : String(error);
      const emptyStats = calculateExtendedStats([], false);
      return {
        fixture: fixture.name,
        bundler: adapter.name,
        time: emptyStats,
        memory: emptyStats,
        bundleSize: 0,
        measurements: [],
        success: false,
        error: errorMessage,
      };
    }
  }

  // Calculate statistics with optional outlier filtering
  const times = measurements.map((m) => m.timeMs);
  const memories = measurements.map((m) => m.memoryBytes);
  const bundleSize = measurements[0]?.bundleSize ?? 0;

  const timeStats = calculateExtendedStats(times, filterOutliers);
  const memoryStats = calculateExtendedStats(memories, filterOutliers);

  if (verbose && filterOutliers) {
    if (timeStats.outliersRemoved > 0) {
      console.log(`    Outliers removed (time): ${timeStats.outliersRemoved}`);
    }
    if (memoryStats.outliersRemoved > 0) {
      console.log(`    Outliers removed (memory): ${memoryStats.outliersRemoved}`);
    }
  }

  return {
    fixture: fixture.name,
    bundler: adapter.name,
    time: timeStats,
    memory: memoryStats,
    bundleSize,
    measurements,
    success: true,
  };
}

/**
 * Calculate comparisons between bundlers.
 */
function calculateComparisons(results: BenchmarkResult[]): BundlerComparison[] {
  const comparisons: BundlerComparison[] = [];

  // Group by fixture
  const byFixture = new Map<string, BenchmarkResult[]>();
  for (const result of results) {
    const existing = byFixture.get(result.fixture) ?? [];
    existing.push(result);
    byFixture.set(result.fixture, existing);
  }

  // Compare esbuild vs webpack for each fixture
  for (const [fixture, fixtureResults] of byFixture) {
    const esbuild = fixtureResults.find((r) => r.bundler === 'esbuild' && r.success);
    const webpack = fixtureResults.find((r) => r.bundler === 'webpack' && r.success);

    if (esbuild && webpack) {
      const esbuildTime = esbuild.time.mean;
      const webpackTime = webpack.time.mean;

      // Determine faster bundler
      const esbuildFaster = esbuildTime < webpackTime;
      const faster = esbuildFaster ? 'esbuild' : 'webpack';
      const slower = esbuildFaster ? 'webpack' : 'esbuild';
      const speedup = esbuildFaster
        ? webpackTime / esbuildTime
        : esbuildTime / webpackTime;

      // Calculate statistical significance
      const esbuildTimes = esbuild.measurements.map((m) => m.timeMs);
      const webpackTimes = webpack.measurements.map((m) => m.timeMs);

      const pValue = welchTTest(esbuildTimes, webpackTimes);
      const effectSize = Math.abs(cohensD(esbuildTimes, webpackTimes));
      const isSignificant = pValue < 0.05;

      comparisons.push({
        fixture,
        faster,
        slower,
        speedup,
        memoryDiff: webpack.memory.mean - esbuild.memory.mean,
        sizeDiff: webpack.bundleSize - esbuild.bundleSize,
        isSignificant,
        pValue,
        effectSize,
      });
    }
  }

  return comparisons;
}

/**
 * Run the complete benchmark suite.
 */
export async function runBenchmarks(
  options: RunnerOptions = {},
): Promise<BenchmarkSuite> {
  const {
    runs = 15,
    warmup = 5,
    fixtures: fixtureFilter,
    bundlers: bundlerFilter,
    verbose = false,
    filterOutliers = true,
  } = options;

  const startTime = performance.now();

  // Capture environment
  const environment = captureEnvironment();

  if (verbose) {
    console.log('Benchmark Configuration:');
    console.log(`  Runs: ${runs}`);
    console.log(`  Warmup: ${warmup}`);
    console.log(`  Outlier filtering: ${filterOutliers ? 'enabled' : 'disabled'}`);
    console.log('');
  }

  // Get fixtures
  let fixtures = DEFAULT_FIXTURES;
  if (fixtureFilter && fixtureFilter.length > 0) {
    fixtures = fixtures.filter((f) => fixtureFilter.includes(f.name));
  }

  // Get bundlers
  let bundlers = getDefaultBundlers();
  if (bundlerFilter && bundlerFilter.length > 0) {
    bundlers = bundlers.filter((b) => bundlerFilter.includes(b.name));
  }

  if (verbose) {
    console.log(`Fixtures: ${fixtures.map((f) => f.name).join(', ')}`);
    console.log(`Bundlers: ${bundlers.map((b) => b.name).join(', ')}`);
    console.log('');
  }

  // Run benchmarks
  const results: BenchmarkResult[] = [];

  for (const fixture of fixtures) {
    if (verbose) {
      console.log(`Benchmarking: ${fixture.name}`);
      console.log(`  ${fixture.description}`);
    }

    for (const bundler of bundlers) {
      const result = await benchmarkFixture(
        fixture,
        bundler,
        runs,
        warmup,
        verbose,
        filterOutliers,
      );
      results.push(result);

      if (verbose && result.success) {
        console.log(
          `  ${bundler.name}: ${result.time.mean.toFixed(2)}ms ± ${result.time.stdDev.toFixed(2)}ms`,
        );
      } else if (verbose && !result.success) {
        console.log(`  ${bundler.name}: FAILED - ${result.error}`);
      }
    }

    if (verbose) {
      console.log('');
    }
  }

  // Calculate comparisons
  const comparisons = calculateComparisons(results);

  const endTime = performance.now();

  return {
    environment,
    results,
    comparisons,
    totalTimeMs: endTime - startTime,
  };
}

/**
 * Get available fixtures.
 */
export function getFixtures(): FixtureConfig[] {
  return DEFAULT_FIXTURES;
}

/**
 * Get available bundler names.
 */
export function getBundlerNames(): string[] {
  const names = ['esbuild', 'webpack'];
  if (typeof globalThis.Bun?.build === 'function') {
    names.push('bun');
  }
  return names;
}
