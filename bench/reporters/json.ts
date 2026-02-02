/**
 * JSON reporter for benchmark results.
 * Outputs machine-readable JSON for CI/CD integration.
 */

import type { BenchmarkReporter, BenchmarkSuite } from '../types';

/**
 * JSON schema version for the benchmark output.
 */
const SCHEMA_VERSION = '1.0.0';

/**
 * JSON schema URL (placeholder for future schema hosting).
 */
const SCHEMA_URL = 'https://github.com/temporalio/build-temporal-workflow/blob/main/bench/schema.json';

/**
 * Create the JSON output with schema metadata.
 */
function createJsonOutput(suite: BenchmarkSuite): object {
  return {
    $schema: SCHEMA_URL,
    schemaVersion: SCHEMA_VERSION,
    ...suite,
  };
}

/**
 * Create the JSON reporter.
 */
export function createJsonReporter(): BenchmarkReporter {
  return {
    report(suite: BenchmarkSuite): string {
      return JSON.stringify(createJsonOutput(suite), null, 2);
    },
  };
}

/**
 * Create a compact JSON reporter (no pretty printing).
 */
export function createCompactJsonReporter(): BenchmarkReporter {
  return {
    report(suite: BenchmarkSuite): string {
      return JSON.stringify(createJsonOutput(suite));
    },
  };
}
