/**
 * Bundle comparison for tracking size changes between builds.
 *
 * Compares two workflow bundles to identify what changed, what was added
 * or removed, and the overall size delta.
 */

import type { BundleComparison, ModuleSizeInfo, WorkflowBundle } from './types';

/**
 * Compare two workflow bundles to identify size changes.
 *
 * @example
 * ```typescript
 * import { compareBundle } from 'bundle-temporal-workflow';
 *
 * const comparison = compareBundle(previousBundle, currentBundle);
 *
 * console.log(`Size change: ${comparison.delta > 0 ? '+' : ''}${comparison.delta} bytes`);
 * console.log(`Change: ${comparison.deltaPercentage.toFixed(1)}%`);
 *
 * if (comparison.added.length > 0) {
 *   console.log('New modules:', comparison.added.map(m => m.path));
 * }
 * ```
 */
export function compareBundle(
  prev: WorkflowBundle,
  current: WorkflowBundle,
): BundleComparison {
  const prevSize = Buffer.byteLength(prev.code, 'utf-8');
  const currentSize = Buffer.byteLength(current.code, 'utf-8');
  const delta = currentSize - prevSize;
  const deltaPercentage = prevSize > 0 ? (delta / prevSize) * 100 : 0;

  const prevModules = extractModuleMap(prev.code, prevSize);
  const currentModules = extractModuleMap(current.code, currentSize);

  const added: ModuleSizeInfo[] = [];
  const removed: ModuleSizeInfo[] = [];
  const changed: BundleComparison['changed'] = [];

  // Find added and changed modules
  for (const [path, info] of currentModules) {
    const prevInfo = prevModules.get(path);
    if (!prevInfo) {
      added.push(info);
    } else if (prevInfo.size !== info.size) {
      changed.push({
        path,
        previousSize: prevInfo.size,
        currentSize: info.size,
        delta: info.size - prevInfo.size,
      });
    }
  }

  // Find removed modules
  for (const [path, info] of prevModules) {
    if (!currentModules.has(path)) {
      removed.push(info);
    }
  }

  // Sort changed by absolute delta descending
  changed.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));

  return {
    previousSize: prevSize,
    currentSize,
    delta,
    deltaPercentage,
    added,
    removed,
    changed,
  };
}

/**
 * Format a bundle comparison as a human-readable report.
 */
export function formatComparison(comparison: BundleComparison): string {
  const lines: string[] = [];

  const sign = comparison.delta >= 0 ? '+' : '';
  lines.push(
    `Size: ${formatBytes(comparison.previousSize)} -> ${formatBytes(comparison.currentSize)} (${sign}${formatBytes(comparison.delta)}, ${sign}${comparison.deltaPercentage.toFixed(1)}%)`,
  );

  if (comparison.added.length > 0) {
    lines.push(`\nAdded (${comparison.added.length}):`);
    for (const mod of comparison.added) {
      lines.push(`  + ${mod.path} (${formatBytes(mod.size)})`);
    }
  }

  if (comparison.removed.length > 0) {
    lines.push(`\nRemoved (${comparison.removed.length}):`);
    for (const mod of comparison.removed) {
      lines.push(`  - ${mod.path} (${formatBytes(mod.size)})`);
    }
  }

  if (comparison.changed.length > 0) {
    lines.push(`\nChanged (${comparison.changed.length}):`);
    for (const mod of comparison.changed.slice(0, 10)) {
      const modSign = mod.delta >= 0 ? '+' : '';
      lines.push(`  ~ ${mod.path} (${modSign}${formatBytes(mod.delta)})`);
    }
  }

  return lines.join('\n');
}

/**
 * Extract a map of module path -> size info from bundle code.
 */
function extractModuleMap(code: string, totalSize: number): Map<string, ModuleSizeInfo> {
  const map = new Map<string, ModuleSizeInfo>();
  const modulePattern = /\/\/ (.+\.[jt]sx?)\n/g;
  let match;
  const positions: Array<{ path: string; start: number }> = [];

  while ((match = modulePattern.exec(code)) !== null) {
    positions.push({ path: match[1]!, start: match.index });
  }

  for (let i = 0; i < positions.length; i++) {
    const current = positions[i]!;
    const nextStart = positions[i + 1]?.start ?? code.length;
    const size = nextStart - current.start;

    map.set(current.path, {
      path: current.path,
      size,
      percentage: (size / totalSize) * 100,
      isExternal: current.path.includes('node_modules'),
    });
  }

  return map;
}

function formatBytes(bytes: number): string {
  const abs = Math.abs(bytes);
  const sign = bytes < 0 ? '-' : '';
  if (abs < 1024) return `${sign}${abs} B`;
  if (abs < 1024 * 1024) return `${sign}${(abs / 1024).toFixed(1)} KB`;
  return `${sign}${(abs / (1024 * 1024)).toFixed(1)} MB`;
}
