/**
 * Markdown reporter for benchmark results.
 * Outputs README-friendly tables.
 */

import type { BenchmarkReporter, BenchmarkResult, BenchmarkSuite } from '../types';
import { formatBytes, formatMs, formatSpeedup } from '../utils/stats';

/**
 * Format a value with ± standard deviation for markdown.
 */
function formatWithStdDev(mean: number, stdDev: number, formatter: (n: number) => string): string {
  return `${formatter(mean)} ± ${formatter(stdDev)}`;
}

/**
 * Create the markdown reporter.
 */
export function createMarkdownReporter(): BenchmarkReporter {
  return {
    report(suite: BenchmarkSuite): string {
      const lines: string[] = [];

      // Title
      lines.push('# Benchmark Results');
      lines.push('');

      // Environment
      lines.push('## Environment');
      lines.push('');
      lines.push('| Property | Value |');
      lines.push('| --- | --- |');
      lines.push(`| Platform | ${suite.environment.platform} (${suite.environment.arch}) |`);
      lines.push(`| Bun | ${suite.environment.bunVersion} |`);
      lines.push(`| Node | ${suite.environment.nodeVersion} |`);
      lines.push(`| CPU | ${suite.environment.cpuModel} |`);
      lines.push(`| Cores | ${suite.environment.cpuCores} |`);
      lines.push(`| Memory | ${formatBytes(suite.environment.totalMemory)} |`);
      lines.push(`| Date | ${new Date(suite.environment.timestamp).toLocaleDateString()} |`);
      lines.push('');

      // Group results by fixture
      const fixtures = new Map<string, BenchmarkResult[]>();
      for (const result of suite.results) {
        const existing = fixtures.get(result.fixture) ?? [];
        existing.push(result);
        fixtures.set(result.fixture, existing);
      }

      // Performance table
      lines.push('## Performance Comparison');
      lines.push('');
      lines.push('| Fixture | esbuild | webpack | Speedup | Bundle Size |');
      lines.push('| --- | ---: | ---: | ---: | ---: |');

      for (const [fixture, results] of fixtures) {
        const esbuild = results.find((r) => r.bundler === 'esbuild');
        const webpack = results.find((r) => r.bundler === 'webpack');

        const esbuildTime = esbuild?.success
          ? formatWithStdDev(esbuild.time.mean, esbuild.time.stdDev, formatMs)
          : esbuild?.error ?? 'N/A';
        const webpackTime = webpack?.success
          ? formatWithStdDev(webpack.time.mean, webpack.time.stdDev, formatMs)
          : webpack?.error ?? 'N/A';

        const comparison = suite.comparisons.find((c) => c.fixture === fixture);
        const speedup = comparison ? `**${formatSpeedup(comparison.speedup)}**` : 'N/A';

        const size = esbuild?.success ? formatBytes(esbuild.bundleSize) : 'N/A';

        lines.push(`| ${fixture} | ${esbuildTime} | ${webpackTime} | ${speedup} | ${size} |`);
      }
      lines.push('');

      // Memory table
      lines.push('## Memory Usage');
      lines.push('');
      lines.push('Peak heap memory during bundling:');
      lines.push('');
      lines.push('| Fixture | esbuild | webpack | Savings |');
      lines.push('| --- | ---: | ---: | ---: |');

      for (const [fixture, results] of fixtures) {
        const esbuild = results.find((r) => r.bundler === 'esbuild');
        const webpack = results.find((r) => r.bundler === 'webpack');

        const esbuildMem = esbuild?.success ? formatBytes(esbuild.memory.mean) : 'N/A';
        const webpackMem = webpack?.success ? formatBytes(webpack.memory.mean) : 'N/A';

        const comparison = suite.comparisons.find((c) => c.fixture === fixture);
        let savings = 'N/A';
        if (comparison && comparison.memoryDiff !== 0) {
          const percent = ((comparison.memoryDiff / (comparison.memoryDiff > 0 ? webpack!.memory.mean : esbuild!.memory.mean)) * 100).toFixed(0);
          savings = comparison.memoryDiff > 0 ? `${percent}% less` : `${Math.abs(Number(percent))}% more`;
        }

        lines.push(`| ${fixture} | ${esbuildMem} | ${webpackMem} | ${savings} |`);
      }
      lines.push('');

      // Summary
      const successCount = suite.results.filter((r) => r.success).length;
      const totalCount = suite.results.length;
      const avgSpeedup =
        suite.comparisons.length > 0
          ? suite.comparisons.reduce((sum, c) => sum + c.speedup, 0) / suite.comparisons.length
          : 0;

      lines.push('## Summary');
      lines.push('');
      lines.push(`- **Benchmarks:** ${successCount}/${totalCount} successful`);
      if (avgSpeedup > 0) {
        lines.push(`- **Average speedup:** ${formatSpeedup(avgSpeedup)}`);
      }
      lines.push(`- **Total time:** ${formatMs(suite.totalTimeMs)}`);
      lines.push('');

      // Footer
      lines.push('---');
      lines.push(`*Generated on ${new Date(suite.environment.timestamp).toISOString()}*`);
      lines.push('');

      return lines.join('\n');
    },
  };
}
