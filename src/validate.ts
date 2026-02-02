/**
 * Bundle validation helpers for Temporal workflow bundles.
 */

import type { ValidationResult, WorkflowBundle } from './types';

/**
 * Validate that a bundle can be used with a given Worker.
 *
 * Checks:
 * - Bundle has metadata
 * - SDK version matches (if metadata present)
 * - Bundle structure is correct
 */
export function validateBundle(
  bundle: WorkflowBundle,
  context: { workerVersion?: string } = {},
): ValidationResult {
  const warnings: string[] = [];

  // Check for metadata
  if (!bundle.metadata) {
    return {
      valid: true,
      warnings: ['Bundle has no metadata - version validation skipped'],
    };
  }

  // Check SDK version match
  if (context.workerVersion && bundle.metadata.temporalSdkVersion) {
    const bundleVersion = bundle.metadata.temporalSdkVersion;
    const workerVersion = context.workerVersion;

    // Extract major.minor for comparison (patch differences are usually compatible)
    const bundleMajorMinor = extractMajorMinor(bundleVersion);
    const workerMajorMinor = extractMajorMinor(workerVersion);

    if (bundleMajorMinor !== workerMajorMinor) {
      warnings.push(
        `Bundle built with SDK ${bundleVersion} but Worker is ${workerVersion}. ` +
          'Consider rebuilding the bundle with the matching SDK version.',
      );
    }
  }

  // Check for any stored warnings
  if (bundle.metadata.warnings) {
    warnings.push(...bundle.metadata.warnings);
  }

  return {
    valid: true,
    warnings: warnings.length > 0 ? warnings : undefined,
  };
}

/**
 * Extract major.minor version from a semver string.
 */
function extractMajorMinor(version: string): string {
  const match = version.match(/^(\d+\.\d+)/);
  return match?.[1] ?? version;
}

/**
 * Validate the structure of a bundle's code.
 *
 * Checks that the bundle has the expected global exports:
 * - globalThis.__TEMPORAL__
 * - globalThis.__webpack_module_cache__
 */
export function validateBundleStructure(code: string): ValidationResult {
  const errors: string[] = [];

  // Check for __TEMPORAL__ assignment
  if (!code.includes('__TEMPORAL__')) {
    errors.push('Missing __TEMPORAL__ global export');
  }

  // Check for module cache reference
  if (!code.includes('__webpack_module_cache__')) {
    errors.push('Missing __webpack_module_cache__ reference');
  }

  if (errors.length > 0) {
    return {
      valid: false,
      error: `Invalid bundle structure:\n${errors.map((e) => `  - ${e}`).join('\n')}`,
    };
  }

  return { valid: true };
}

/**
 * Get the Temporal SDK version from the installed package.
 */
export function getTemporalSdkVersion(): string | undefined {
  try {
    // Try to read version from @temporalio/workflow package.json
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const pkg = require('@temporalio/workflow/package.json') as { version?: string };
    return typeof pkg.version === 'string' ? pkg.version : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Get the bundler version.
 */
export function getBundlerVersion(): string {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const pkg = require('../package.json') as { version?: string };
    return typeof pkg.version === 'string' ? pkg.version : '0.0.0';
  } catch {
    return '0.0.0';
  }
}
