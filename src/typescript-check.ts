/**
 * TypeScript type checking integration for workflow builds.
 *
 * Provides type checking during the build process with
 * workflow-specific rules for catching common mistakes.
 */

import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

import type { TypeCheckOptions } from './types';

/**
 * Result of TypeScript type checking.
 */
export interface TypeCheckResult {
  /**
   * Whether type checking passed.
   */
  success: boolean;

  /**
   * Type errors found.
   */
  errors: TypeCheckDiagnostic[];

  /**
   * Type warnings found.
   */
  warnings: TypeCheckDiagnostic[];
}

/**
 * A single type check diagnostic.
 */
export interface TypeCheckDiagnostic {
  /**
   * File path.
   */
  file: string;

  /**
   * Line number.
   */
  line: number;

  /**
   * Column number.
   */
  column: number;

  /**
   * Diagnostic message.
   */
  message: string;

  /**
   * TypeScript error code.
   */
  code?: number;
}

/**
 * Run TypeScript type checking on workflow source files.
 *
 * Uses the TypeScript compiler API to check types without emitting output.
 * Optionally enforces workflow-specific rules.
 *
 * @example
 * ```typescript
 * import { typeCheckWorkflows } from 'bundle-temporal-workflow';
 *
 * const result = await typeCheckWorkflows('./src/workflows.ts', {
 *   strict: true,
 *   workflowRules: true,
 * });
 *
 * if (!result.success) {
 *   for (const error of result.errors) {
 *     console.error(`${error.file}:${error.line}:${error.column} - ${error.message}`);
 *   }
 * }
 * ```
 */
export async function typeCheckWorkflows(
  workflowsPath: string,
  options: TypeCheckOptions = {},
): Promise<TypeCheckResult> {
  if (!options.enabled) {
    return { success: true, errors: [], warnings: [] };
  }

  const resolvedPath = resolve(workflowsPath);
  const errors: TypeCheckDiagnostic[] = [];
  const warnings: TypeCheckDiagnostic[] = [];

  // Try to use TypeScript compiler API
  try {
    const ts = await import('typescript');

    // Find tsconfig
    const configPath = ts.findConfigFile(
      dirname(resolvedPath),
      (fileName) => ts.sys.fileExists(fileName),
      'tsconfig.json',
    );

    let compilerOptions: Record<string, unknown> = {
      noEmit: true,
      skipLibCheck: true,
    };

    if (options.strict) {
      compilerOptions = {
        ...compilerOptions,
        strict: true,
        noImplicitAny: true,
        noImplicitReturns: true,
      };
    }

    if (configPath) {
      const configFile = ts.readConfigFile(configPath, (path) => ts.sys.readFile(path));
      const parsed = ts.parseJsonConfigFileContent(
        configFile.config,
        ts.sys,
        dirname(configPath),
      );
      compilerOptions = {
        ...parsed.options,
        ...compilerOptions,
      };
    }

    const program = ts.createProgram(
      [resolvedPath],
      compilerOptions as Record<string, unknown> & import('typescript').CompilerOptions,
    );
    const diagnostics = ts.getPreEmitDiagnostics(program);

    for (const diagnostic of diagnostics) {
      if (!diagnostic.file) continue;

      const { line, character } = diagnostic.file.getLineAndCharacterOfPosition(
        diagnostic.start ?? 0,
      );
      const message = ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n');

      const diag: TypeCheckDiagnostic = {
        file: diagnostic.file.fileName,
        line: line + 1,
        column: character + 1,
        message,
        code: diagnostic.code,
      };

      if (diagnostic.category === ts.DiagnosticCategory.Error) {
        errors.push(diag);
      } else {
        warnings.push(diag);
      }
    }
  } catch {
    // TypeScript not available - skip type checking
    warnings.push({
      file: resolvedPath,
      line: 0,
      column: 0,
      message:
        'TypeScript compiler not available. Install typescript as a devDependency for type checking.',
    });
  }

  // Apply workflow-specific rules
  if (options.workflowRules) {
    const workflowWarnings = checkWorkflowRules(resolvedPath);
    warnings.push(...workflowWarnings);
  }

  return {
    success: errors.length === 0,
    errors,
    warnings,
  };
}

/**
 * Check workflow-specific type rules.
 */
function checkWorkflowRules(filePath: string): TypeCheckDiagnostic[] {
  const warnings: TypeCheckDiagnostic[] = [];

  if (!existsSync(filePath)) {
    return warnings;
  }

  const code = readFileSync(filePath, 'utf-8');
  const lines = code.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;

    // Check for workflow functions without Promise return type
    const funcMatch = line.match(/export\s+async\s+function\s+(\w+)\s*\([^)]*\)\s*{/);
    if (funcMatch) {
      warnings.push({
        file: filePath,
        line: i + 1,
        column: 1,
        message: `Workflow function "${funcMatch[1]}" has no return type annotation. Consider adding a return type for clarity.`,
      });
    }

    // Check for 'any' type usage
    if (line.includes(': any') && !line.includes('// eslint-disable')) {
      warnings.push({
        file: filePath,
        line: i + 1,
        column: line.indexOf(': any') + 1,
        message:
          'Using "any" type in workflow code. Consider using more specific types for better type safety.',
      });
    }
  }

  return warnings;
}
