/**
 * CLI for running benchmarks.
 *
 * Usage:
 *   bun benchmark [options]
 *
 * Options:
 *   -f, --fixture <name>   Run specific fixture(s), comma-separated
 *   -b, --bundler <name>   Run specific bundler(s), comma-separated
 *   -r, --runs <n>         Number of measured runs (default: 15)
 *   -w, --warmup <n>       Number of warmup runs (default: 5)
 *   -o, --output <format>  Output format: console, json, markdown (default: console)
 *   --file <path>          Write results to file
 *   --no-filter-outliers   Disable outlier filtering
 *   -v, --verbose          Show detailed progress
 *   -h, --help             Show help
 */

import { mkdir, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

import {
  createConsoleReporter,
  createJsonReporter,
  createMarkdownReporter,
} from './reporters';
import { getBundlerNames, getFixtures, runBenchmarks } from './runner';
import type { BenchmarkReporter, RunnerOptions } from './types';

interface CliOptions {
  fixtures?: string[];
  bundlers?: string[];
  runs: number;
  warmup: number;
  output: 'console' | 'json' | 'markdown';
  file?: string;
  verbose: boolean;
  help: boolean;
  filterOutliers: boolean;
}

function parseArgs(args: string[]): CliOptions {
  const options: CliOptions = {
    runs: 15,
    warmup: 5,
    output: 'console',
    verbose: false,
    help: false,
    filterOutliers: true,
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    const nextArg = args[i + 1];

    switch (arg) {
      case '-f':
      case '--fixture':
        if (nextArg) {
          options.fixtures = nextArg.split(',').map((s) => s.trim());
          i++;
        }
        break;

      case '-b':
      case '--bundler':
        if (nextArg) {
          options.bundlers = nextArg.split(',').map((s) => s.trim());
          i++;
        }
        break;

      case '-r':
      case '--runs':
        if (nextArg) {
          options.runs = parseInt(nextArg, 10);
          i++;
        }
        break;

      case '-w':
      case '--warmup':
        if (nextArg) {
          options.warmup = parseInt(nextArg, 10);
          i++;
        }
        break;

      case '-o':
      case '--output':
        if (nextArg && ['console', 'json', 'markdown'].includes(nextArg)) {
          options.output = nextArg as 'console' | 'json' | 'markdown';
          i++;
        }
        break;

      case '--file':
        if (nextArg) {
          options.file = nextArg;
          i++;
        }
        break;

      case '-v':
      case '--verbose':
        options.verbose = true;
        break;

      case '--no-filter-outliers':
        options.filterOutliers = false;
        break;

      case '-h':
      case '--help':
        options.help = true;
        break;
    }
  }

  return options;
}

function printHelp(): void {
  const fixtures = getFixtures();
  const bundlers = getBundlerNames();

  console.log(`
Temporal Workflow Bundler Benchmark

Usage:
  bun benchmark [options]

Options:
  -f, --fixture <name>   Run specific fixture(s), comma-separated
  -b, --bundler <name>   Run specific bundler(s), comma-separated
  -r, --runs <n>         Number of measured runs (default: 15)
  -w, --warmup <n>       Number of warmup runs (default: 5)
  -o, --output <format>  Output format: console, json, markdown (default: console)
  --file <path>          Write results to file
  --no-filter-outliers   Disable outlier filtering (IQR method)
  -v, --verbose          Show detailed progress
  -h, --help             Show this help

Available Fixtures:
${fixtures.map((f) => `  ${f.name.padEnd(12)} ${f.description}`).join('\n')}

Available Bundlers:
${bundlers.map((b) => `  ${b}`).join('\n')}

Statistical Notes:
  - Results include 95% confidence intervals
  - Outliers are filtered using the IQR method by default
  - Significance: * p<0.05, ** p<0.01

Examples:
  # Run quick benchmark with small fixture
  bun benchmark:quick

  # Run full benchmark suite
  bun benchmark:full

  # Compare only esbuild on all fixtures
  bun benchmark -- -b esbuild -v

  # Export results as JSON
  bun benchmark -- -o json --file results.json

  # Export results as markdown
  bun benchmark -- -o markdown --file BENCHMARK.md

  # Disable outlier filtering
  bun benchmark -- --no-filter-outliers
`);
}

function getReporter(format: 'console' | 'json' | 'markdown'): BenchmarkReporter {
  switch (format) {
    case 'json':
      return createJsonReporter();
    case 'markdown':
      return createMarkdownReporter();
    default:
      return createConsoleReporter();
  }
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const options = parseArgs(args);

  if (options.help) {
    printHelp();
    process.exit(0);
  }

  // Validate options
  if (options.runs < 1) {
    console.error('Error: runs must be at least 1');
    process.exit(1);
  }

  if (options.warmup < 0) {
    console.error('Error: warmup must be non-negative');
    process.exit(1);
  }

  // Validate fixture names
  if (options.fixtures) {
    const validFixtures = getFixtures().map((f) => f.name);
    for (const fixture of options.fixtures) {
      if (!validFixtures.includes(fixture)) {
        console.error(
          `Error: Unknown fixture '${fixture}'. Valid fixtures: ${validFixtures.join(', ')}`,
        );
        process.exit(1);
      }
    }
  }

  // Validate bundler names
  if (options.bundlers) {
    const validBundlers = getBundlerNames();
    for (const bundler of options.bundlers) {
      if (!validBundlers.includes(bundler)) {
        console.error(
          `Error: Unknown bundler '${bundler}'. Valid bundlers: ${validBundlers.join(', ')}`,
        );
        process.exit(1);
      }
    }
  }

  // Run benchmarks
  const runnerOptions: RunnerOptions = {
    runs: options.runs,
    warmup: options.warmup,
    fixtures: options.fixtures,
    bundlers: options.bundlers,
    verbose: options.verbose,
    filterOutliers: options.filterOutliers,
  };

  console.log('Starting benchmark suite...\n');

  try {
    const suite = await runBenchmarks(runnerOptions);

    // Generate report
    const reporter = getReporter(options.output);
    const report = reporter.report(suite);

    // Output or save report
    if (options.file) {
      // Ensure directory exists
      const dir = dirname(options.file);
      if (dir && dir !== '.') {
        await mkdir(dir, { recursive: true });
      }

      await writeFile(options.file, report, 'utf-8');
      console.log(`Results written to: ${options.file}`);
    } else {
      console.log(report);
    }

    // Exit with error if any benchmark failed
    const failedCount = suite.results.filter((r) => !r.success).length;
    if (failedCount > 0) {
      process.exit(1);
    }
  } catch (error) {
    console.error('Benchmark failed:', error);
    process.exit(1);
  }
}

main();
