/**
 * SDK version compatibility matrix.
 *
 * Checks compatibility between the bundler version, the SDK version
 * used during bundling, and the SDK version of the worker at runtime.
 */

import type { SdkCompatibility } from './types';
import { getBundlerVersion, getTemporalSdkVersion } from './validate';

/**
 * Known compatibility constraints between versions.
 *
 * Each entry specifies a minimum bundler version required for a given
 * SDK version range.
 */
const COMPATIBILITY_MATRIX: Array<{
  sdkMinVersion: string;
  sdkMaxVersion?: string;
  minBundlerVersion: string;
  notes?: string;
}> = [
  {
    sdkMinVersion: '1.0.0',
    sdkMaxVersion: '1.13.99',
    minBundlerVersion: '0.1.0',
    notes: 'Basic compatibility. Some features may not work.',
  },
  {
    sdkMinVersion: '1.14.0',
    minBundlerVersion: '0.1.0',
    notes: 'Full compatibility with module overrides.',
  },
];

/**
 * Check SDK version compatibility.
 *
 * @example
 * ```typescript
 * import { checkSdkCompatibility } from 'bundle-temporal-workflow';
 *
 * const compat = checkSdkCompatibility('1.14.0');
 *
 * if (!compat.compatible) {
 *   console.warn('Compatibility issues:');
 *   for (const warning of compat.warnings) {
 *     console.warn(`  - ${warning}`);
 *   }
 * }
 * ```
 */
export function checkSdkCompatibility(workerSdkVersion?: string): SdkCompatibility {
  const bundlerVersion = getBundlerVersion();
  const bundleSdkVersion = getTemporalSdkVersion() ?? 'unknown';
  const workerVersion = workerSdkVersion ?? bundleSdkVersion;

  const warnings: string[] = [];
  let compatible = true;

  // Check bundler vs SDK compatibility
  if (bundleSdkVersion !== 'unknown') {
    const matrixEntry = findMatrixEntry(bundleSdkVersion);
    if (matrixEntry) {
      if (compareSemver(bundlerVersion, matrixEntry.minBundlerVersion) < 0) {
        warnings.push(
          `Bundler version ${bundlerVersion} may not fully support SDK ${bundleSdkVersion}. ` +
            `Minimum recommended bundler version: ${matrixEntry.minBundlerVersion}`,
        );
        compatible = false;
      }
      if (matrixEntry.notes) {
        warnings.push(matrixEntry.notes);
      }
    }
  }

  // Check bundle SDK vs worker SDK
  if (workerVersion !== bundleSdkVersion && bundleSdkVersion !== 'unknown') {
    const bundleMajorMinor = extractMajorMinor(bundleSdkVersion);
    const workerMajorMinor = extractMajorMinor(workerVersion);

    if (bundleMajorMinor !== workerMajorMinor) {
      warnings.push(
        `Bundle was built with SDK ${bundleSdkVersion} but worker uses ${workerVersion}. ` +
          'Major/minor version mismatch may cause runtime issues.',
      );
      compatible = false;
    }
  }

  return {
    bundlerVersion,
    bundleSdkVersion,
    workerSdkVersion: workerVersion,
    compatible,
    warnings,
  };
}

/**
 * Get detailed compatibility information as a formatted string.
 */
export function formatCompatibilityInfo(compat: SdkCompatibility): string {
  const lines: string[] = [
    `Bundler: v${compat.bundlerVersion}`,
    `Bundle SDK: v${compat.bundleSdkVersion}`,
    `Worker SDK: v${compat.workerSdkVersion}`,
    `Compatible: ${compat.compatible ? 'Yes' : 'No'}`,
  ];

  if (compat.warnings.length > 0) {
    lines.push('');
    lines.push('Warnings:');
    for (const warning of compat.warnings) {
      lines.push(`  - ${warning}`);
    }
  }

  return lines.join('\n');
}

/**
 * Find a matching entry in the compatibility matrix.
 */
function findMatrixEntry(sdkVersion: string) {
  for (const entry of COMPATIBILITY_MATRIX) {
    if (
      compareSemver(sdkVersion, entry.sdkMinVersion) >= 0 &&
      (!entry.sdkMaxVersion || compareSemver(sdkVersion, entry.sdkMaxVersion) <= 0)
    ) {
      return entry;
    }
  }
  return undefined;
}

/**
 * Compare two semver strings.
 * Returns negative if a < b, 0 if equal, positive if a > b.
 */
function compareSemver(a: string, b: string): number {
  const aParts = a.split('.').map(Number);
  const bParts = b.split('.').map(Number);

  for (let i = 0; i < 3; i++) {
    const diff = (aParts[i] ?? 0) - (bParts[i] ?? 0);
    if (diff !== 0) return diff;
  }

  return 0;
}

/**
 * Extract major.minor from a version string.
 */
function extractMajorMinor(version: string): string {
  const match = version.match(/^(\d+\.\d+)/);
  return match?.[1] ?? version;
}
