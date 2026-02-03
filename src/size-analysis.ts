/**
 * Bundle size analysis and budget enforcement.
 *
 * Provides tools for analyzing bundle composition, tracking size budgets,
 * and identifying the largest contributors to bundle size.
 */

import { gzipSync } from 'node:zlib';

import type {
  BundleSizeBudget,
  ModuleSizeInfo,
  SizeAnalysisResult,
  WorkflowBundle,
} from './types';

/**
 * Analyze the size composition of a workflow bundle.
 *
 * @example
 * ```typescript
 * import { bundleWorkflowCode, analyzeSize } from 'bundle-temporal-workflow';
 *
 * const bundle = await bundleWorkflowCode({
 *   workflowsPath: './src/workflows.ts',
 * });
 *
 * const analysis = analyzeSize(bundle, { total: 500 * 1024 }); // 500KB budget
 *
 * console.log(`Total: ${analysis.totalSize} bytes`);
 * console.log(`Gzip: ${analysis.gzipSize} bytes`);
 * console.log('Top contributors:');
 * for (const mod of analysis.topContributors) {
 *   console.log(`  ${mod.path}: ${mod.size} bytes (${mod.percentage.toFixed(1)}%)`);
 * }
 * ```
 */
export function analyzeSize(
  bundle: WorkflowBundle,
  budget?: BundleSizeBudget,
): SizeAnalysisResult {
  const code = bundle.code;
  const totalSize = Buffer.byteLength(code, 'utf-8');

  // Estimate gzip size
  const gzipSize = gzipSync(Buffer.from(code)).length;

  // Parse module boundaries from bundle
  const modules = extractModulesFromBundle(code, totalSize);

  // Sort by size descending
  modules.sort((a, b) => b.size - a.size);

  // Top 10 contributors
  const topContributors = modules.slice(0, 10);

  // Check budget
  let budgetResult: SizeAnalysisResult['budgetResult'];
  if (budget) {
    budgetResult = checkBudget(totalSize, modules, budget);
  }

  return {
    totalSize,
    gzipSize,
    moduleCount: modules.length,
    modules,
    topContributors,
    ...(budgetResult !== undefined && { budgetResult }),
  };
}

/**
 * Extract module size information from a bundled file.
 *
 * This parses the esbuild CJS output format to identify individual modules
 * by looking for the typical module boundary markers.
 */
function extractModulesFromBundle(code: string, totalSize: number): ModuleSizeInfo[] {
  const modules: ModuleSizeInfo[] = [];

  // esbuild CJS bundles have module markers like:
  // // path/to/module.js
  // or require_module_name patterns
  const modulePattern = /\/\/ (.+\.[jt]sx?)\n/g;
  let match;
  const positions: Array<{ path: string; start: number }> = [];

  while ((match = modulePattern.exec(code)) !== null) {
    positions.push({
      path: match[1]!,
      start: match.index,
    });
  }

  for (let i = 0; i < positions.length; i++) {
    const current = positions[i]!;
    const nextStart = positions[i + 1]?.start ?? code.length;
    const size = nextStart - current.start;
    const isExternal =
      current.path.includes('node_modules') || current.path.startsWith('node_modules');

    modules.push({
      path: current.path,
      size,
      percentage: (size / totalSize) * 100,
      isExternal,
    });
  }

  // If no modules were found, treat entire bundle as a single module
  if (modules.length === 0) {
    modules.push({
      path: '(bundle)',
      size: totalSize,
      percentage: 100,
      isExternal: false,
    });
  }

  return modules;
}

/**
 * Check bundle size against a budget.
 */
function checkBudget(
  totalSize: number,
  modules: ModuleSizeInfo[],
  budget: BundleSizeBudget,
): SizeAnalysisResult['budgetResult'] {
  const failThreshold = budget.fail ?? 100;
  const warnThreshold = budget.warn ?? 80;

  // Check total size budget
  if (budget.total) {
    const percentage = (totalSize / budget.total) * 100;

    if (percentage >= failThreshold) {
      return {
        status: 'fail',
        message: `Bundle size ${formatBytes(totalSize)} exceeds budget of ${formatBytes(budget.total)}`,
        overBudget: totalSize - budget.total,
      };
    }

    if (percentage >= warnThreshold) {
      return {
        status: 'warn',
        message: `Bundle size ${formatBytes(totalSize)} is ${percentage.toFixed(1)}% of budget (${formatBytes(budget.total)})`,
      };
    }
  }

  // Check per-module budget
  if (budget.perModule) {
    const overBudgetModules = modules.filter((m) => m.size > budget.perModule!);
    if (overBudgetModules.length > 0) {
      const biggest = overBudgetModules[0]!;
      return {
        status: 'fail',
        message: `Module "${biggest.path}" (${formatBytes(biggest.size)}) exceeds per-module budget of ${formatBytes(budget.perModule)}`,
        overBudget: biggest.size - budget.perModule,
      };
    }
  }

  return {
    status: 'pass',
    message: 'Bundle is within budget',
  };
}

/**
 * Format bytes as a human-readable string.
 */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Parse a size string like "500KB" or "1MB" into bytes.
 */
export function parseSize(sizeStr: string): number {
  const match = sizeStr.match(/^(\d+(?:\.\d+)?)\s*(B|KB|MB|GB)$/i);
  if (!match) {
    throw new Error(
      `Invalid size format: "${sizeStr}". Use format like "500KB" or "1MB".`,
    );
  }

  const value = parseFloat(match[1]!);
  const unit = match[2]!.toUpperCase();

  switch (unit) {
    case 'B':
      return value;
    case 'KB':
      return value * 1024;
    case 'MB':
      return value * 1024 * 1024;
    case 'GB':
      return value * 1024 * 1024 * 1024;
    default:
      return value;
  }
}
