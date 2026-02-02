/**
 * JSON reporter for benchmark results.
 * Outputs machine-readable JSON for CI/CD integration.
 */

import type { BenchmarkReporter, BenchmarkSuite } from '../types';

/**
 * Create the JSON reporter.
 */
export function createJsonReporter(): BenchmarkReporter {
  return {
    report(suite: BenchmarkSuite): string {
      return JSON.stringify(suite, null, 2);
    },
  };
}

/**
 * Create a compact JSON reporter (no pretty printing).
 */
export function createCompactJsonReporter(): BenchmarkReporter {
  return {
    report(suite: BenchmarkSuite): string {
      return JSON.stringify(suite);
    },
  };
}
