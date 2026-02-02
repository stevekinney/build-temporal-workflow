/**
 * Type definitions for the benchmark suite.
 */

/**
 * Interface for bundler adapters.
 * Both esbuild and webpack bundlers implement this interface.
 */
export interface BundlerAdapter {
  /**
   * Name of the bundler (e.g., 'esbuild', 'webpack')
   */
  readonly name: string;

  /**
   * Bundle workflow code from the given path.
   * @param workflowsPath - Path to the workflows file or directory
   * @returns The bundled code as a string
   */
  bundle(workflowsPath: string): Promise<BundleOutput>;
}

/**
 * Output from a bundler.
 */
export interface BundleOutput {
  /**
   * The bundled JavaScript code
   */
  code: string;

  /**
   * Size of the bundle in bytes
   */
  size: number;
}

/**
 * Raw measurement from a single benchmark run.
 */
export interface BenchmarkMeasurement {
  /**
   * Time taken in milliseconds
   */
  timeMs: number;

  /**
   * Peak memory usage in bytes (heap used)
   */
  memoryBytes: number;

  /**
   * Bundle size in bytes
   */
  bundleSize: number;
}

/**
 * Statistical summary of measurements.
 */
export interface StatSummary {
  /**
   * Minimum value
   */
  min: number;

  /**
   * Maximum value
   */
  max: number;

  /**
   * Arithmetic mean
   */
  mean: number;

  /**
   * Median (50th percentile)
   */
  median: number;

  /**
   * Standard deviation
   */
  stdDev: number;

  /**
   * 95th percentile
   */
  p95: number;

  /**
   * Number of samples
   */
  count: number;
}

/**
 * Result for a single fixture/bundler combination.
 */
export interface BenchmarkResult {
  /**
   * Name of the fixture
   */
  fixture: string;

  /**
   * Name of the bundler
   */
  bundler: string;

  /**
   * Time statistics in milliseconds
   */
  time: StatSummary;

  /**
   * Memory statistics in bytes
   */
  memory: StatSummary;

  /**
   * Bundle size in bytes (consistent across runs)
   */
  bundleSize: number;

  /**
   * Raw measurements
   */
  measurements: BenchmarkMeasurement[];

  /**
   * Whether the benchmark succeeded
   */
  success: boolean;

  /**
   * Error message if the benchmark failed
   */
  error?: string;
}

/**
 * Information about the benchmark environment.
 */
export interface EnvironmentInfo {
  /**
   * Platform (darwin, linux, win32)
   */
  platform: string;

  /**
   * Architecture (x64, arm64)
   */
  arch: string;

  /**
   * Bun version
   */
  bunVersion: string;

  /**
   * Node.js version (for comparison)
   */
  nodeVersion: string;

  /**
   * CPU model
   */
  cpuModel: string;

  /**
   * Number of CPU cores
   */
  cpuCores: number;

  /**
   * Total system memory in bytes
   */
  totalMemory: number;

  /**
   * Timestamp when the benchmark started
   */
  timestamp: string;
}

/**
 * Fixture configuration.
 */
export interface FixtureConfig {
  /**
   * Name of the fixture
   */
  name: string;

  /**
   * Path to the workflows file
   */
  workflowsPath: string;

  /**
   * Description of the fixture
   */
  description: string;

  /**
   * Expected number of modules (for verification)
   */
  expectedModules?: number;
}

/**
 * Full benchmark suite results.
 */
export interface BenchmarkSuite {
  /**
   * Environment information
   */
  environment: EnvironmentInfo;

  /**
   * Results for each fixture/bundler combination
   */
  results: BenchmarkResult[];

  /**
   * Comparison data between bundlers
   */
  comparisons: BundlerComparison[];

  /**
   * Total time taken for the benchmark suite
   */
  totalTimeMs: number;
}

/**
 * Comparison between two bundlers for a fixture.
 */
export interface BundlerComparison {
  /**
   * Name of the fixture
   */
  fixture: string;

  /**
   * Name of the faster bundler
   */
  faster: string;

  /**
   * Name of the slower bundler
   */
  slower: string;

  /**
   * Speedup ratio (slower.mean / faster.mean)
   */
  speedup: number;

  /**
   * Memory difference (slower.mean - faster.mean) in bytes
   */
  memoryDiff: number;

  /**
   * Bundle size difference (slower - faster) in bytes
   */
  sizeDiff: number;
}

/**
 * Options for running benchmarks.
 */
export interface RunnerOptions {
  /**
   * Number of measured runs per fixture/bundler
   * @default 5
   */
  runs?: number;

  /**
   * Number of warmup runs to discard
   * @default 2
   */
  warmup?: number;

  /**
   * Filter to specific fixtures by name
   */
  fixtures?: string[];

  /**
   * Filter to specific bundlers by name
   */
  bundlers?: string[];

  /**
   * Whether to show verbose output
   * @default false
   */
  verbose?: boolean;
}

/**
 * Reporter interface for outputting benchmark results.
 */
export interface BenchmarkReporter {
  /**
   * Report the benchmark suite results.
   */
  report(suite: BenchmarkSuite): string;
}
