/**
 * Workflow export validation.
 *
 * Validates that workflow source files export proper workflow functions
 * at build time, catching common mistakes before deployment.
 */

import { readFileSync } from 'node:fs';

import type { ExportValidationResult, ValidationOptions } from './types';

/**
 * Validate the exports of a workflow source file.
 *
 * Checks that:
 * - The file exports at least one function
 * - Exported functions are async (if required)
 * - Function names match expected patterns
 * - Functions have return types (if required)
 *
 * @example
 * ```typescript
 * import { validateWorkflowExports } from 'bundle-temporal-workflow';
 *
 * const result = validateWorkflowExports('./src/workflows.ts', {
 *   requireAsync: true,
 *   namePattern: /^[a-z][a-zA-Z]+Workflow$/,
 * });
 *
 * if (!result.valid) {
 *   for (const error of result.errors) {
 *     console.error(`${error.exportName}: ${error.message}`);
 *   }
 * }
 * ```
 */
export function validateWorkflowExports(
  workflowsPath: string,
  options: ValidationOptions = {},
): ExportValidationResult {
  const code = readFileSync(workflowsPath, 'utf-8');
  return validateWorkflowExportsFromSource(code, options);
}

/**
 * Validate workflow exports from source code string.
 */
export function validateWorkflowExportsFromSource(
  code: string,
  options: ValidationOptions = {},
): ExportValidationResult {
  const requireAsync = options.requireAsync !== false;
  const exports = extractExports(code);
  const errors: ExportValidationResult['errors'] = [];
  const warnings: ExportValidationResult['warnings'] = [];

  if (exports.length === 0) {
    errors.push({
      exportName: '(none)',
      message:
        'No exported functions found. Workflow files must export at least one function.',
    });
    return { valid: false, exports: [], errors, warnings };
  }

  for (const exp of exports) {
    // Check async requirement
    if (requireAsync && !exp.isAsync) {
      errors.push({
        exportName: exp.name,
        message: `Workflow function "${exp.name}" should be async. Workflows must return Promises.`,
      });
    }

    // Check name pattern
    if (options.namePattern && !options.namePattern.test(exp.name)) {
      warnings.push({
        exportName: exp.name,
        message: `Function name "${exp.name}" does not match the expected pattern ${options.namePattern.source}.`,
      });
    }

    // Check return type
    if (options.requireReturnTypes && !exp.hasReturnType) {
      warnings.push({
        exportName: exp.name,
        message: `Function "${exp.name}" has no explicit return type annotation.`,
      });
    }

    // Check for common mistakes
    if (exp.name.startsWith('_')) {
      warnings.push({
        exportName: exp.name,
        message: `Function "${exp.name}" starts with underscore. Private functions should not be exported.`,
      });
    }
  }

  return {
    valid: errors.length === 0,
    exports: exports.map((e) => e.name),
    errors,
    warnings,
  };
}

interface ExportedFunction {
  name: string;
  isAsync: boolean;
  hasReturnType: boolean;
  line: number;
}

/**
 * Extract exported functions from source code.
 */
function extractExports(code: string): ExportedFunction[] {
  const results: ExportedFunction[] = [];
  const lines = code.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;

    // Match: export async function name(
    const asyncFuncMatch = line.match(/export\s+(async\s+)?function\s+(\w+)\s*\(/);
    if (asyncFuncMatch) {
      const hasReturnType = hasExplicitReturnType(code, line, i, lines);
      results.push({
        name: asyncFuncMatch[2]!,
        isAsync: !!asyncFuncMatch[1],
        hasReturnType,
        line: i + 1,
      });
      continue;
    }

    // Match: export const name = async (
    const constMatch = line.match(
      /export\s+const\s+(\w+)\s*=\s*(async\s+)?(?:\([^)]*\)|[a-zA-Z_$]\w*)\s*(?:=>|{)/,
    );
    if (constMatch) {
      results.push({
        name: constMatch[1]!,
        isAsync: !!constMatch[2],
        hasReturnType: line.includes(':') && line.indexOf(':') < line.indexOf('='),
        line: i + 1,
      });
    }
  }

  return results;
}

/**
 * Check if a function declaration has an explicit return type.
 */
function hasExplicitReturnType(
  _code: string,
  line: string,
  lineIndex: number,
  lines: string[],
): boolean {
  // Look for : Type after the closing ) and before {
  const closingParen = line.lastIndexOf(')');
  if (closingParen === -1) {
    // Multi-line parameters - check next lines
    for (let i = lineIndex + 1; i < Math.min(lineIndex + 10, lines.length); i++) {
      const nextLine = lines[i]!;
      if (nextLine.includes(')')) {
        const afterParen = nextLine.slice(nextLine.indexOf(')') + 1);
        return (
          afterParen.includes(':') && afterParen.indexOf(':') < afterParen.indexOf('{')
        );
      }
    }
    return false;
  }

  const afterParen = line.slice(closingParen + 1);
  return (
    afterParen.includes(':') &&
    (afterParen.indexOf('{') === -1 || afterParen.indexOf(':') < afterParen.indexOf('{'))
  );
}
