/**
 * Console reporter for benchmark results.
 * Outputs formatted tables to the terminal.
 */

import type { BenchmarkReporter, BenchmarkResult, BenchmarkSuite, BundlerComparison } from '../types';
import { formatEnvironment } from '../utils/environment';
import { formatBytes, formatMs, formatSpeedup } from '../utils/stats';

/**
 * Characters for table drawing.
 */
const TABLE = {
  topLeft: '┌',
  topRight: '┐',
  bottomLeft: '└',
  bottomRight: '┘',
  horizontal: '─',
  vertical: '│',
  leftT: '├',
  rightT: '┤',
  topT: '┬',
  bottomT: '┴',
  cross: '┼',
};

/**
 * Format a value with ± standard deviation.
 */
function formatWithStdDev(mean: number, stdDev: number, formatter: (n: number) => string): string {
  return `${formatter(mean)} ± ${formatter(stdDev)}`;
}

/**
 * Get significance indicator based on p-value.
 */
function getSignificanceIndicator(comparison: BundlerComparison | undefined): string {
  if (!comparison || comparison.pValue === undefined) return '';
  if (comparison.pValue < 0.01) return '**';
  if (comparison.pValue < 0.05) return '*';
  return '';
}


/**
 * Pad a string to a specific length.
 */
function pad(str: string, length: number, align: 'left' | 'right' | 'center' = 'left'): string {
  const padding = length - str.length;
  if (padding <= 0) return str;

  switch (align) {
    case 'right':
      return ' '.repeat(padding) + str;
    case 'center': {
      const leftPad = Math.floor(padding / 2);
      const rightPad = padding - leftPad;
      return ' '.repeat(leftPad) + str + ' '.repeat(rightPad);
    }
    default:
      return str + ' '.repeat(padding);
  }
}

/**
 * Create a horizontal line for the table.
 */
function createLine(
  widths: number[],
  left: string,
  middle: string,
  right: string,
  fill: string,
): string {
  return left + widths.map((w) => fill.repeat(w + 2)).join(middle) + right;
}

/**
 * Create a row for the table.
 */
function createRow(cells: string[], widths: number[], aligns: ('left' | 'right' | 'center')[]): string {
  const paddedCells = cells.map((cell, i) => ' ' + pad(cell, widths[i], aligns[i]) + ' ');
  return TABLE.vertical + paddedCells.join(TABLE.vertical) + TABLE.vertical;
}

/**
 * Create the console reporter.
 */
export function createConsoleReporter(): BenchmarkReporter {
  return {
    report(suite: BenchmarkSuite): string {
      const lines: string[] = [];

      // Header
      lines.push('');
      lines.push('═══════════════════════════════════════════════════════════════════');
      lines.push('                    BENCHMARK RESULTS                              ');
      lines.push('═══════════════════════════════════════════════════════════════════');
      lines.push('');

      // Environment info
      lines.push('Environment:');
      lines.push(formatEnvironment(suite.environment).split('\n').map((l) => `  ${l}`).join('\n'));
      lines.push('');

      // Group results by fixture
      const fixtures = new Map<string, BenchmarkResult[]>();
      for (const result of suite.results) {
        const existing = fixtures.get(result.fixture) ?? [];
        existing.push(result);
        fixtures.set(result.fixture, existing);
      }

      // Main results table
      const headers = ['Fixture', 'esbuild (ms)', 'webpack (ms)', 'Speedup', 'Size'];
      const aligns: ('left' | 'right' | 'center')[] = ['left', 'right', 'right', 'right', 'right'];

      // Calculate column widths
      const rows: string[][] = [];
      for (const [fixture, results] of fixtures) {
        const esbuild = results.find((r) => r.bundler === 'esbuild');
        const webpack = results.find((r) => r.bundler === 'webpack');

        const esbuildTime = esbuild?.success
          ? formatWithStdDev(esbuild.time.mean, esbuild.time.stdDev, formatMs)
          : esbuild?.error ?? 'N/A';
        const webpackTime = webpack?.success
          ? formatWithStdDev(webpack.time.mean, webpack.time.stdDev, formatMs)
          : webpack?.error ?? 'N/A';

        // Find speedup from comparisons
        const comparison = suite.comparisons.find((c) => c.fixture === fixture);
        const significanceIndicator = getSignificanceIndicator(comparison);
        const speedup = comparison ? `${formatSpeedup(comparison.speedup)}${significanceIndicator}` : 'N/A';

        const size = esbuild?.success ? formatBytes(esbuild.bundleSize) : 'N/A';

        rows.push([fixture, esbuildTime, webpackTime, speedup, size]);
      }

      // Calculate column widths
      const widths = headers.map((h, i) =>
        Math.max(h.length, ...rows.map((r) => r[i].length)),
      );

      // Draw table
      lines.push(createLine(widths, TABLE.topLeft, TABLE.topT, TABLE.topRight, TABLE.horizontal));
      lines.push(createRow(headers, widths, aligns));
      lines.push(createLine(widths, TABLE.leftT, TABLE.cross, TABLE.rightT, TABLE.horizontal));

      for (const row of rows) {
        lines.push(createRow(row, widths, aligns));
      }

      lines.push(createLine(widths, TABLE.bottomLeft, TABLE.bottomT, TABLE.bottomRight, TABLE.horizontal));
      lines.push('');

      // Memory usage table
      lines.push('Memory Usage (peak heap):');
      const memHeaders = ['Fixture', 'esbuild', 'webpack', 'Difference'];
      const memAligns: ('left' | 'right' | 'center')[] = ['left', 'right', 'right', 'right'];
      const memRows: string[][] = [];

      for (const [fixture, results] of fixtures) {
        const esbuild = results.find((r) => r.bundler === 'esbuild');
        const webpack = results.find((r) => r.bundler === 'webpack');

        const esbuildMem = esbuild?.success ? formatBytes(esbuild.memory.mean) : 'N/A';
        const webpackMem = webpack?.success ? formatBytes(webpack.memory.mean) : 'N/A';

        const comparison = suite.comparisons.find((c) => c.fixture === fixture);
        const diff = comparison
          ? (comparison.memoryDiff > 0 ? '+' : '') + formatBytes(comparison.memoryDiff)
          : 'N/A';

        memRows.push([fixture, esbuildMem, webpackMem, diff]);
      }

      const memWidths = memHeaders.map((h, i) =>
        Math.max(h.length, ...memRows.map((r) => r[i].length)),
      );

      lines.push(createLine(memWidths, TABLE.topLeft, TABLE.topT, TABLE.topRight, TABLE.horizontal));
      lines.push(createRow(memHeaders, memWidths, memAligns));
      lines.push(createLine(memWidths, TABLE.leftT, TABLE.cross, TABLE.rightT, TABLE.horizontal));

      for (const row of memRows) {
        lines.push(createRow(row, memWidths, memAligns));
      }

      lines.push(createLine(memWidths, TABLE.bottomLeft, TABLE.bottomT, TABLE.bottomRight, TABLE.horizontal));
      lines.push('');

      // Summary
      const successCount = suite.results.filter((r) => r.success).length;
      const totalCount = suite.results.length;
      const avgSpeedup =
        suite.comparisons.length > 0
          ? suite.comparisons.reduce((sum, c) => sum + c.speedup, 0) / suite.comparisons.length
          : 0;

      // Check for low sample sizes
      const lowSampleResults = suite.results.filter((r) => r.success && r.time.count < 10);

      lines.push('Summary:');
      lines.push(`  Benchmarks: ${successCount}/${totalCount} successful`);
      if (avgSpeedup > 0) {
        lines.push(`  Average speedup: ${formatSpeedup(avgSpeedup)}`);
      }
      lines.push(`  Total time: ${formatMs(suite.totalTimeMs)}`);

      // Sample size warnings
      if (lowSampleResults.length > 0) {
        lines.push('');
        lines.push('Warnings:');
        for (const result of lowSampleResults) {
          lines.push(`  ${result.fixture}/${result.bundler}: low sample size (n=${result.time.count})`);
        }
      }

      // Legend
      lines.push('');
      lines.push('Legend: * p<0.05, ** p<0.01 (statistically significant)');
      lines.push('');

      return lines.join('\n');
    },
  };
}
