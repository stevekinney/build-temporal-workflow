/**
 * CI-friendly output modes for build results.
 *
 * Provides structured JSON output and text reports suitable for
 * CI/CD pipelines, GitHub Actions annotations, and other automation.
 */

import type { BundleComparison, SizeAnalysisResult, WorkflowBundle } from './types';

/**
 * CI report structure for JSON output.
 */
export interface CIReport {
  /**
   * Whether the build succeeded.
   */
  success: boolean;

  /**
   * Build result summary.
   */
  build?: {
    size: number;
    gzipSize?: number;
    moduleCount?: number;
    mode: string;
    bundlerVersion?: string;
    sdkVersion?: string;
  };

  /**
   * Size budget results.
   */
  budget?: {
    status: 'pass' | 'warn' | 'fail';
    message: string;
    overBudget?: number;
  };

  /**
   * Comparison with previous build.
   */
  comparison?: {
    previousSize: number;
    currentSize: number;
    delta: number;
    deltaPercentage: number;
  };

  /**
   * Validation errors.
   */
  errors?: string[];

  /**
   * Warnings.
   */
  warnings?: string[];
}

/**
 * Generate a CI-friendly JSON report from a build result.
 *
 * @example
 * ```bash
 * bundle-temporal-workflow build ./workflows --ci --json > report.json
 * ```
 */
export function generateCIReport(
  bundle: WorkflowBundle,
  options?: {
    sizeAnalysis?: SizeAnalysisResult;
    comparison?: BundleComparison;
    errors?: string[];
    warnings?: string[];
  },
): CIReport {
  const report: CIReport = {
    success: true,
    build: {
      size: bundle.code.length,
      mode: bundle.metadata?.mode ?? 'unknown',
      ...(bundle.metadata?.bundlerVersion !== undefined && {
        bundlerVersion: bundle.metadata.bundlerVersion,
      }),
      ...(bundle.metadata?.temporalSdkVersion !== undefined && {
        sdkVersion: bundle.metadata.temporalSdkVersion,
      }),
    },
  };

  if (options?.sizeAnalysis) {
    report.build!.gzipSize = options.sizeAnalysis.gzipSize;
    report.build!.moduleCount = options.sizeAnalysis.moduleCount;

    if (options.sizeAnalysis.budgetResult) {
      report.budget = options.sizeAnalysis.budgetResult;
      if (report.budget.status === 'fail') {
        report.success = false;
      }
    }
  }

  if (options?.comparison) {
    report.comparison = {
      previousSize: options.comparison.previousSize,
      currentSize: options.comparison.currentSize,
      delta: options.comparison.delta,
      deltaPercentage: options.comparison.deltaPercentage,
    };
  }

  if (options?.errors?.length) {
    report.errors = options.errors;
    report.success = false;
  }

  if (options?.warnings?.length) {
    report.warnings = options.warnings;
  }

  if (bundle.metadata?.warnings?.length) {
    report.warnings = [...(report.warnings ?? []), ...bundle.metadata.warnings];
  }

  return report;
}

/**
 * Format a CI report as a text summary suitable for PR comments.
 */
export function formatCIReportText(report: CIReport): string {
  const lines: string[] = [];

  if (report.build) {
    lines.push(`Bundle size: ${formatBytes(report.build.size)}`);
    if (report.build.gzipSize) {
      lines.push(`Gzip size: ${formatBytes(report.build.gzipSize)}`);
    }
    if (report.build.moduleCount) {
      lines.push(`Modules: ${report.build.moduleCount}`);
    }
  }

  if (report.budget) {
    const icon =
      report.budget.status === 'pass'
        ? 'PASS'
        : report.budget.status === 'warn'
          ? 'WARN'
          : 'FAIL';
    lines.push(`Budget: [${icon}] ${report.budget.message}`);
  }

  if (report.comparison) {
    const sign = report.comparison.delta >= 0 ? '+' : '';
    lines.push(
      `Delta: ${sign}${formatBytes(report.comparison.delta)} (${sign}${report.comparison.deltaPercentage.toFixed(1)}%)`,
    );
  }

  if (report.errors?.length) {
    lines.push('\nErrors:');
    for (const error of report.errors) {
      lines.push(`  - ${error}`);
    }
  }

  if (report.warnings?.length) {
    lines.push('\nWarnings:');
    for (const warning of report.warnings) {
      lines.push(`  - ${warning}`);
    }
  }

  return lines.join('\n');
}

/**
 * Format a CI report as GitHub Actions annotations.
 */
export function formatGitHubAnnotations(report: CIReport): string {
  const lines: string[] = [];

  if (report.errors?.length) {
    for (const error of report.errors) {
      lines.push(`::error::${error}`);
    }
  }

  if (report.warnings?.length) {
    for (const warning of report.warnings) {
      lines.push(`::warning::${warning}`);
    }
  }

  if (report.budget?.status === 'fail') {
    lines.push(`::error::${report.budget.message}`);
  } else if (report.budget?.status === 'warn') {
    lines.push(`::warning::${report.budget.message}`);
  }

  return lines.join('\n');
}

function formatBytes(bytes: number): string {
  const abs = Math.abs(bytes);
  const sign = bytes < 0 ? '-' : '';
  if (abs < 1024) return `${sign}${abs} B`;
  if (abs < 1024 * 1024) return `${sign}${(abs / 1024).toFixed(1)} KB`;
  return `${sign}${(abs / (1024 * 1024)).toFixed(1)} MB`;
}
