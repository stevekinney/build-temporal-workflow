/**
 * Deterministic build verification.
 *
 * Verifies that repeated builds of the same source code produce identical
 * output, ensuring reproducible builds.
 */

import { bundleWorkflowCode } from './bundler';
import type { BundleOptions } from './types';

/**
 * Result of a determinism verification check.
 */
export interface DeterminismVerifyResult {
  /**
   * Whether the builds are deterministic.
   */
  deterministic: boolean;

  /**
   * Number of builds performed.
   */
  buildCount: number;

  /**
   * Hash of the first build.
   */
  referenceHash: string;

  /**
   * Hashes of all builds.
   */
  hashes: string[];

  /**
   * Differences found between builds (if any).
   */
  differences?: string[];
}

/**
 * Verify that a workflow bundle produces deterministic output.
 *
 * Builds the bundle multiple times and compares the output to ensure
 * reproducibility. This is important for CI/CD pipelines where builds
 * should be identical regardless of build host.
 *
 * @example
 * ```typescript
 * import { verifyDeterministicBuild } from 'bundle-temporal-workflow';
 *
 * const result = await verifyDeterministicBuild(
 *   { workflowsPath: './src/workflows.ts' },
 *   3, // Build 3 times
 * );
 *
 * if (!result.deterministic) {
 *   console.error('Non-deterministic build detected!');
 *   console.error('Differences:', result.differences);
 * }
 * ```
 */
export async function verifyDeterministicBuild(
  options: BundleOptions,
  buildCount = 3,
): Promise<DeterminismVerifyResult> {
  const count = Math.max(2, Math.min(buildCount, 10));
  const hashes: string[] = [];
  const codes: string[] = [];

  // Build multiple times, stripping timestamps from metadata
  for (let i = 0; i < count; i++) {
    const bundle = await bundleWorkflowCode({
      ...options,
      report: false, // Disable metadata (contains timestamps)
    });

    // Strip any remaining timestamp-like patterns for comparison
    const normalizedCode = normalizeForComparison(bundle.code);
    const hash = new Bun.CryptoHasher('sha256').update(normalizedCode).digest('hex');

    hashes.push(hash);
    codes.push(normalizedCode);
  }

  const referenceHash = hashes[0]!;
  const allMatch = hashes.every((h) => h === referenceHash);

  let differences: string[] | undefined;
  if (!allMatch) {
    differences = findDifferences(codes);
  }

  return {
    deterministic: allMatch,
    buildCount: count,
    referenceHash,
    hashes,
    ...(differences !== undefined && { differences }),
  };
}

/**
 * Normalize bundle code for deterministic comparison.
 *
 * Strips timestamps, build IDs, and other non-deterministic values.
 */
function normalizeForComparison(code: string): string {
  return (
    code
      // Strip ISO timestamps
      .replace(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}.\d{3}Z/g, '<TIMESTAMP>')
      // Strip Unix timestamps
      .replace(/\b\d{13}\b/g, '<UNIX_TS>')
      // Strip metadata comments
      .replace(/\/\*\s*__TEMPORAL_BUNDLE_METADATA__[\s\S]*?\*\//g, '<METADATA>')
  );
}

/**
 * Find differences between multiple code strings.
 */
function findDifferences(codes: string[]): string[] {
  const differences: string[] = [];
  const reference = codes[0]!;
  const refLines = reference.split('\n');

  for (let i = 1; i < codes.length; i++) {
    const compareLines = codes[i]!.split('\n');
    const maxLines = Math.max(refLines.length, compareLines.length);

    for (let line = 0; line < maxLines; line++) {
      const refLine = refLines[line];
      const cmpLine = compareLines[line];

      if (refLine !== cmpLine) {
        differences.push(
          `Build 0 vs Build ${i}, line ${line + 1}:\n` +
            `  - ${refLine?.slice(0, 100) ?? '(missing)'}\n` +
            `  + ${cmpLine?.slice(0, 100) ?? '(missing)'}`,
        );

        // Limit to first 5 differences
        if (differences.length >= 5) {
          differences.push('... (truncated)');
          return differences;
        }
      }
    }
  }

  return differences;
}
