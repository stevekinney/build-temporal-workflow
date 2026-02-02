/**
 * Bundle validation helpers for Temporal workflow bundles.
 */

import type { ValidationResult, WorkflowBundle } from './types';

/**
 * Options for detailed bundle validation.
 */
export interface ValidateBundleOptions {
  /**
   * Expected Worker SDK version.
   */
  workerVersion?: string;

  /**
   * Expected SDK version (alias for workerVersion).
   */
  expectedSdkVersion?: string;

  /**
   * Minimum required bundler version.
   */
  minBundlerVersion?: string;

  /**
   * Whether to validate bundle structure.
   * Default: true
   */
  validateStructure?: boolean;

  /**
   * Whether to treat version mismatches as errors vs warnings.
   * Default: false (warnings only)
   */
  strictVersionCheck?: boolean;
}

/**
 * Enhanced validation result with separate errors and warnings.
 */
export interface EnhancedValidationResult {
  /**
   * Whether the bundle is valid.
   */
  valid: boolean;

  /**
   * Errors that prevent the bundle from being used.
   */
  errors: string[];

  /**
   * Warnings that don't prevent usage but should be addressed.
   */
  warnings: string[];

  /**
   * Metadata extracted from the bundle.
   */
  metadata?:
    | {
        sdkVersion?: string | undefined;
        bundlerVersion?: string | undefined;
        createdAt?: string | undefined;
        mode?: string | undefined;
      }
    | undefined;
}

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
 * Perform detailed validation of a workflow bundle.
 *
 * This is an enhanced version of validateBundle that provides:
 * - Separate errors and warnings arrays
 * - Bundler version validation
 * - Optional strict mode for version checking
 * - Extracted metadata for inspection
 *
 * @example
 * ```typescript
 * import { validateBundleDetailed, loadBundle } from 'bundle-temporal-workflow';
 *
 * const { bundle } = await loadBundle({ path: './bundle.js' });
 *
 * const result = validateBundleDetailed(bundle, {
 *   expectedSdkVersion: '1.14.0',
 *   strictVersionCheck: true,
 * });
 *
 * if (!result.valid) {
 *   console.error('Bundle validation failed:', result.errors);
 *   process.exit(1);
 * }
 *
 * if (result.warnings.length > 0) {
 *   console.warn('Bundle warnings:', result.warnings);
 * }
 * ```
 */
export function validateBundleDetailed(
  bundle: WorkflowBundle,
  options: ValidateBundleOptions = {},
): EnhancedValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  const expectedSdkVersion = options.expectedSdkVersion ?? options.workerVersion;

  // Extract metadata for response
  const metadata = bundle.metadata
    ? {
        sdkVersion: bundle.metadata.temporalSdkVersion,
        bundlerVersion: bundle.metadata.bundlerVersion,
        createdAt: bundle.metadata.createdAt,
        mode: bundle.metadata.mode,
      }
    : undefined;

  // Validate structure if requested
  if (options.validateStructure !== false) {
    const structureResult = validateBundleStructure(bundle.code);
    if (!structureResult.valid) {
      errors.push(structureResult.error ?? 'Invalid bundle structure');
    }
    if (structureResult.warnings) {
      warnings.push(...structureResult.warnings);
    }
  }

  // Check for metadata
  if (!bundle.metadata) {
    warnings.push('Bundle has no metadata - version validation skipped');
    return {
      valid: errors.length === 0,
      errors,
      warnings,
      metadata,
    };
  }

  // Check SDK version
  if (expectedSdkVersion && bundle.metadata.temporalSdkVersion) {
    const bundleVersion = bundle.metadata.temporalSdkVersion;
    const comparison = compareVersions(bundleVersion, expectedSdkVersion);

    if (comparison !== 'compatible') {
      const message = formatVersionMismatch(
        'SDK',
        bundleVersion,
        expectedSdkVersion,
        comparison,
      );

      if (options.strictVersionCheck) {
        errors.push(message);
      } else {
        warnings.push(message);
      }
    }
  }

  // Check bundler version
  if (options.minBundlerVersion && bundle.metadata.bundlerVersion) {
    const bundlerVersion = bundle.metadata.bundlerVersion;
    const comparison = compareVersions(bundlerVersion, options.minBundlerVersion);

    if (comparison === 'older') {
      const message =
        `Bundle was created with bundler ${bundlerVersion} but minimum required is ${options.minBundlerVersion}. ` +
        'Consider rebuilding with a newer bundler version.';

      if (options.strictVersionCheck) {
        errors.push(message);
      } else {
        warnings.push(message);
      }
    }
  }

  // Include any warnings stored in metadata
  if (bundle.metadata.warnings) {
    warnings.push(...bundle.metadata.warnings);
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    metadata,
  };
}

/**
 * Compare two semver versions.
 */
function compareVersions(
  actual: string,
  expected: string,
): 'compatible' | 'older' | 'newer' | 'different' {
  const actualMajorMinor = extractMajorMinor(actual);
  const expectedMajorMinor = extractMajorMinor(expected);

  if (actualMajorMinor === expectedMajorMinor) {
    return 'compatible';
  }

  const [actualMajor, actualMinor] = actualMajorMinor.split('.').map(Number);
  const [expectedMajor, expectedMinor] = expectedMajorMinor.split('.').map(Number);

  if (actualMajor! < expectedMajor!) {
    return 'older';
  }
  if (actualMajor! > expectedMajor!) {
    return 'newer';
  }
  if (actualMinor! < expectedMinor!) {
    return 'older';
  }
  if (actualMinor! > expectedMinor!) {
    return 'newer';
  }

  return 'different';
}

/**
 * Format a version mismatch message.
 */
function formatVersionMismatch(
  component: string,
  actual: string,
  expected: string,
  comparison: 'older' | 'newer' | 'different',
): string {
  switch (comparison) {
    case 'older':
      return (
        `Bundle was built with ${component} ${actual} but ${expected} is expected. ` +
        'The bundle may be missing features or fixes. Consider rebuilding.'
      );
    case 'newer':
      return (
        `Bundle was built with ${component} ${actual} but ${expected} is expected. ` +
        'The bundle may use features not available in the worker. Consider rebuilding.'
      );
    default:
      return (
        `Bundle was built with ${component} ${actual} but ${expected} is expected. ` +
        'Consider rebuilding with a matching version.'
      );
  }
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
 * Cached version strings to avoid repeated package.json reads.
 */
let cachedTemporalSdkVersion: string | undefined | null = null;
let cachedBundlerVersion: string | undefined;

/**
 * Get the Temporal SDK version from the installed package.
 * Result is cached after first call.
 */
export function getTemporalSdkVersion(): string | undefined {
  if (cachedTemporalSdkVersion !== null) {
    return cachedTemporalSdkVersion;
  }

  try {
    // Try to read version from @temporalio/workflow package.json
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const pkg = require('@temporalio/workflow/package.json') as { version?: string };
    cachedTemporalSdkVersion = typeof pkg.version === 'string' ? pkg.version : undefined;
  } catch {
    cachedTemporalSdkVersion = undefined;
  }

  return cachedTemporalSdkVersion;
}

/**
 * Get the bundler version.
 * Result is cached after first call.
 */
export function getBundlerVersion(): string {
  if (cachedBundlerVersion !== undefined) {
    return cachedBundlerVersion;
  }

  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const pkg = require('../package.json') as { version?: string };
    cachedBundlerVersion = typeof pkg.version === 'string' ? pkg.version : '0.0.0';
  } catch {
    cachedBundlerVersion = '0.0.0';
  }

  return cachedBundlerVersion;
}
