/**
 * Markdown reporter for benchmark results.
 * Outputs README-friendly tables.
 */

import type {
  BenchmarkReporter,
  BenchmarkResult,
  BenchmarkSuite,
  BundlerComparison,
  ExtendedStatSummary,
} from '../types';
import { formatBytes, formatMs, formatSpeedup } from '../utils/stats';

/**
 * Format a value with ± standard deviation for markdown.
 */
function formatWithStdDev(mean: number, stdDev: number, formatter: (n: number) => string): string {
  return `${formatter(mean)} ± ${formatter(stdDev)}`;
}

/**
 * Get significance indicator based on p-value.
 */
function getSignificanceIndicator(comparison: BundlerComparison | undefined): string {
  if (!comparison || comparison.pValue === undefined) return '';
  if (comparison.pValue < 0.01) return ' \\*\\*';
  if (comparison.pValue < 0.05) return ' \\*';
  return '';
}

/**
 * Check if a stat summary is extended.
 */
function isExtendedStats(stats: unknown): stats is ExtendedStatSummary {
  return (
    typeof stats === 'object' &&
    stats !== null &&
    'ci95Lower' in stats &&
    'ci95Upper' in stats
  );
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

      // Add git info if available
      if (suite.environment.gitCommit) {
        const dirtyIndicator = suite.environment.gitDirty ? ' (dirty)' : '';
        lines.push(`| Git Commit | ${suite.environment.gitCommit}${dirtyIndicator} |`);
      }

      // Add dependency versions if available
      if (suite.environment.dependencies) {
        for (const [dep, version] of Object.entries(suite.environment.dependencies)) {
          lines.push(`| ${dep} | ${version} |`);
        }
      }

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
        const significanceIndicator = getSignificanceIndicator(comparison);
        const speedup = comparison ? `**${formatSpeedup(comparison.speedup)}**${significanceIndicator}` : 'N/A';

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

      // Extended statistics section
      const hasExtendedStats = suite.results.some((r) => r.success && isExtendedStats(r.time));
      if (hasExtendedStats) {
        lines.push('## Extended Statistics');
        lines.push('');
        lines.push('95% confidence intervals and effect sizes:');
        lines.push('');
        lines.push('| Fixture | Bundler | Mean | 95% CI | CV% | Effect Size |');
        lines.push('| --- | --- | ---: | --- | ---: | ---: |');

        for (const result of suite.results.filter((r) => r.success)) {
          if (isExtendedStats(result.time)) {
            const ci = `[${formatMs(result.time.ci95Lower)}, ${formatMs(result.time.ci95Upper)}]`;
            const cv = result.time.coefficientOfVariation.toFixed(1);

            // Find effect size from comparison
            const comparison = suite.comparisons.find((c) => c.fixture === result.fixture);
            const effectSize =
              comparison?.effectSize !== undefined ? comparison.effectSize.toFixed(2) : '-';

            lines.push(
              `| ${result.fixture} | ${result.bundler} | ${formatMs(result.time.mean)} | ${ci} | ${cv}% | ${effectSize} |`,
            );
          }
        }
        lines.push('');
      }

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

      // Significance legend
      lines.push('### Statistical Significance');
      lines.push('');
      lines.push('- \\* p < 0.05 (statistically significant)');
      lines.push('- \\*\\* p < 0.01 (highly significant)');
      lines.push('- Effect size (Cohen\'s d): small < 0.5, medium 0.5-0.8, large > 0.8');
      lines.push('');

      // Footer
      lines.push('---');
      lines.push(`*Generated on ${new Date(suite.environment.timestamp).toISOString()}*`);
      lines.push('');

      return lines.join('\n');
    },
  };
}
