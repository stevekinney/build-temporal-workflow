/**
 * Package boundary enforcement for workflow/activity separation.
 *
 * Enforces that certain packages are only used in workflow code,
 * others only in activity code, and some are allowed in both.
 */

import { readFileSync } from 'node:fs';

import type { PackageBoundaries } from './types';

/**
 * Default package boundaries for Temporal applications.
 */
export const DEFAULT_BOUNDARIES: PackageBoundaries = {
  workflowOnly: ['@temporalio/workflow'],
  activityOnly: [
    '@temporalio/activity',
    'axios',
    'pg',
    'mysql',
    'mysql2',
    'redis',
    'ioredis',
    'mongodb',
    'mongoose',
    'prisma',
    '@prisma/client',
    'nodemailer',
    'aws-sdk',
    '@aws-sdk',
    'googleapis',
    '@google-cloud',
  ],
  shared: ['@temporalio/common', 'zod', 'yup', 'io-ts', 'superstruct', 'uuid'],
};

/**
 * Result of boundary enforcement checking.
 */
export interface BoundaryViolation {
  /**
   * The import that violates boundaries.
   */
  importPath: string;

  /**
   * The file where the violation was found.
   */
  file: string;

  /**
   * Line number of the violation.
   */
  line: number;

  /**
   * The boundary category that was violated.
   */
  category: 'workflowOnly' | 'activityOnly';

  /**
   * Description of the violation.
   */
  message: string;
}

/**
 * Result of boundary enforcement analysis.
 */
export interface BoundaryCheckResult {
  /**
   * Whether all boundaries are respected.
   */
  valid: boolean;

  /**
   * List of violations found.
   */
  violations: BoundaryViolation[];
}

/**
 * Check workflow source code for package boundary violations.
 *
 * Ensures workflow code doesn't import activity-only packages.
 *
 * @example
 * ```typescript
 * import { checkWorkflowBoundaries } from 'bundle-temporal-workflow';
 *
 * const result = checkWorkflowBoundaries('./src/workflows.ts');
 *
 * if (!result.valid) {
 *   for (const v of result.violations) {
 *     console.error(`${v.file}:${v.line} - ${v.message}`);
 *   }
 * }
 * ```
 */
export function checkWorkflowBoundaries(
  filePath: string,
  boundaries: PackageBoundaries = DEFAULT_BOUNDARIES,
): BoundaryCheckResult {
  const code = readFileSync(filePath, 'utf-8');
  return checkBoundariesFromSource(code, filePath, 'workflow', boundaries);
}

/**
 * Check activity source code for package boundary violations.
 *
 * Ensures activity code doesn't import workflow-only packages.
 */
export function checkActivityBoundaries(
  filePath: string,
  boundaries: PackageBoundaries = DEFAULT_BOUNDARIES,
): BoundaryCheckResult {
  const code = readFileSync(filePath, 'utf-8');
  return checkBoundariesFromSource(code, filePath, 'activity', boundaries);
}

/**
 * Check source code for boundary violations.
 */
export function checkBoundariesFromSource(
  code: string,
  filePath: string,
  context: 'workflow' | 'activity',
  boundaries: PackageBoundaries = DEFAULT_BOUNDARIES,
): BoundaryCheckResult {
  const violations: BoundaryViolation[] = [];
  const lines = code.split('\n');

  // Determine which packages are forbidden in this context
  const forbiddenPackages =
    context === 'workflow' ? boundaries.activityOnly : boundaries.workflowOnly;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;

    // Extract import paths
    const importMatch = line.match(
      /(?:import|require)\s*(?:\(?\s*['"]([^'"]+)['"]\)?|.*\bfrom\s+['"]([^'"]+)['"])/,
    );

    if (!importMatch) continue;

    const importPath = importMatch[1] ?? importMatch[2];
    if (!importPath) continue;

    // Skip relative imports
    if (importPath.startsWith('.') || importPath.startsWith('/')) continue;

    // Skip type-only imports
    if (line.includes('import type')) continue;

    // Check against forbidden packages
    for (const pkg of forbiddenPackages) {
      if (importPath === pkg || importPath.startsWith(`${pkg}/`)) {
        const opposite = context === 'workflow' ? 'activity' : 'workflow';
        violations.push({
          importPath,
          file: filePath,
          line: i + 1,
          category: context === 'workflow' ? 'activityOnly' : 'workflowOnly',
          message:
            `Package "${importPath}" is ${opposite}-only and should not be imported in ${context} code. ` +
            (context === 'workflow'
              ? 'Use proxyActivities() to call activity functions instead.'
              : 'Import workflow utilities from @temporalio/common for shared functionality.'),
        });
        break;
      }
    }
  }

  return {
    valid: violations.length === 0,
    violations,
  };
}
