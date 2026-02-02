/**
 * Main benchmark runner.
 */

import { join } from 'node:path';

import { createEsbuildAdapter, createWebpackAdapter } from './adapters';
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
import { forceGC, getHeapUsed } from './utils/memory';
import { calculateStats } from './utils/stats';

/**
 * Default fixtures to benchmark.
 */
const DEFAULT_FIXTURES: FixtureConfig[] = [
  {
    name: 'small',
    workflowsPath: join(import.meta.dir, 'fixtures/small/workflows.ts'),
    description: 'Small fixture (~5 modules, baseline)',
  },
  {
    name: 'medium',
    workflowsPath: join(import.meta.dir, 'fixtures/medium/workflows.ts'),
    description: 'Medium fixture (~20 modules, realistic)',
  },
  {
    name: 'large',
    workflowsPath: join(import.meta.dir, 'fixtures/large/workflows.ts'),
    description: 'Large fixture (~50+ modules, stress test)',
  },
  {
    name: 'heavy-deps',
    workflowsPath: join(import.meta.dir, 'fixtures/heavy-deps/workflows.ts'),
    description: 'Heavy dependencies fixture',
  },
];

/**
 * Default bundler adapters.
 */
function getDefaultBundlers(): BundlerAdapter[] {
  return [createEsbuildAdapter(), createWebpackAdapter()];
}

/**
 * Run a single benchmark iteration.
 */
async function runIteration(
  adapter: BundlerAdapter,
  workflowsPath: string,
): Promise<BenchmarkMeasurement> {
  // Force GC before measurement to get clean baseline
  forceGC();
  await Bun.sleep(10); // Allow GC to complete

  const startMemory = getHeapUsed();
  let peakMemory = startMemory;

  // Track peak memory during execution with high-frequency sampling
  const memoryInterval = setInterval(() => {
    const current = getHeapUsed();
    if (current > peakMemory) {
      peakMemory = current;
    }
  }, 1);

  const startTime = performance.now();

  // Run the bundler
  let output;
  try {
    output = await adapter.bundle(workflowsPath);
  } finally {
    clearInterval(memoryInterval);
  }

  const endTime = performance.now();

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
): Promise<BenchmarkResult> {
  if (verbose) {
    console.log(`  ${adapter.name}: warming up...`);
  }

  // Warmup runs (discarded)
  for (let i = 0; i < warmup; i++) {
    try {
      await runIteration(adapter, fixture.workflowsPath);
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
      const measurement = await runIteration(adapter, fixture.workflowsPath);
      measurements.push(measurement);

      if (verbose) {
        console.log(`    Run ${i + 1}: ${measurement.timeMs.toFixed(2)}ms`);
      }
    } catch (error) {
      // If any run fails, record it and stop
      const errorMessage = error instanceof Error ? error.message : String(error);
      return {
        fixture: fixture.name,
        bundler: adapter.name,
        time: calculateStats([]),
        memory: calculateStats([]),
        bundleSize: 0,
        measurements: [],
        success: false,
        error: errorMessage,
      };
    }
  }

  // Calculate statistics
  const times = measurements.map((m) => m.timeMs);
  const memories = measurements.map((m) => m.memoryBytes);
  const bundleSize = measurements[0]?.bundleSize ?? 0;

  return {
    fixture: fixture.name,
    bundler: adapter.name,
    time: calculateStats(times),
    memory: calculateStats(memories),
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
      const speedup = esbuildFaster ? webpackTime / esbuildTime : esbuildTime / webpackTime;

      comparisons.push({
        fixture,
        faster,
        slower,
        speedup,
        memoryDiff: webpack.memory.mean - esbuild.memory.mean,
        sizeDiff: webpack.bundleSize - esbuild.bundleSize,
      });
    }
  }

  return comparisons;
}

/**
 * Run the complete benchmark suite.
 */
export async function runBenchmarks(options: RunnerOptions = {}): Promise<BenchmarkSuite> {
  const { runs = 5, warmup = 2, fixtures: fixtureFilter, bundlers: bundlerFilter, verbose = false } = options;

  const startTime = performance.now();

  // Capture environment
  const environment = captureEnvironment();

  if (verbose) {
    console.log('Benchmark Configuration:');
    console.log(`  Runs: ${runs}`);
    console.log(`  Warmup: ${warmup}`);
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
      const result = await benchmarkFixture(fixture, bundler, runs, warmup, verbose);
      results.push(result);

      if (verbose && result.success) {
        console.log(`  ${bundler.name}: ${result.time.mean.toFixed(2)}ms ± ${result.time.stdDev.toFixed(2)}ms`);
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
  return ['esbuild', 'webpack'];
}
