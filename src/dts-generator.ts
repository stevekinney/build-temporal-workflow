/**
 * Declaration file generation for workflow exports.
 *
 * Generates .d.ts files that describe the workflow functions exported
 * by a bundle, enabling type-safe workflow client usage.
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * Generate TypeScript declaration files for workflow exports.
 *
 * Creates a .d.ts file that re-exports workflow function types,
 * enabling type-safe usage with Temporal's WorkflowClient.
 *
 * @example
 * ```typescript
 * import { generateWorkflowDeclarations } from 'bundle-temporal-workflow';
 *
 * await generateWorkflowDeclarations(
 *   './src/workflows.ts',
 *   './dist/workflows.d.ts',
 * );
 *
 * // Now you can import types:
 * // import type { myWorkflow } from './dist/workflows';
 * // const handle = await client.start(myWorkflow, { ... });
 * ```
 */
export function generateWorkflowDeclarations(
  workflowsPath: string,
  outputPath: string,
): void {
  const resolvedInput = resolve(workflowsPath);
  const resolvedOutput = resolve(outputPath);
  const code = readFileSync(resolvedInput, 'utf-8');

  const declarations = generateDeclarationContent(code, resolvedInput);
  writeFileSync(resolvedOutput, declarations);
}

/**
 * Generate declaration content from workflow source code.
 */
export function generateDeclarationContent(code: string, sourcePath?: string): string {
  const exports = extractWorkflowSignatures(code);
  const lines: string[] = [];

  lines.push('/**');
  lines.push(' * Auto-generated workflow type declarations.');
  if (sourcePath) {
    lines.push(` * Source: ${sourcePath}`);
  }
  lines.push(` * Generated: ${new Date().toISOString()}`);
  lines.push(' */');
  lines.push('');

  for (const exp of exports) {
    if (exp.jsdoc) {
      lines.push(exp.jsdoc);
    }
    lines.push(`export declare function ${exp.name}(${exp.params}): ${exp.returnType};`);
    lines.push('');
  }

  return lines.join('\n');
}

interface WorkflowSignature {
  name: string;
  params: string;
  returnType: string;
  jsdoc?: string;
}

/**
 * Extract workflow function signatures from source code.
 */
function extractWorkflowSignatures(code: string): WorkflowSignature[] {
  const results: WorkflowSignature[] = [];
  const lines = code.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;

    // Match: export async function name(params): ReturnType {
    const funcMatch = line.match(
      /export\s+(?:async\s+)?function\s+(\w+)\s*\(([^)]*)\)(?:\s*:\s*([^{]+?))?(?:\s*\{)/,
    );

    if (funcMatch) {
      const name = funcMatch[1]!;
      const params = funcMatch[2]!.trim();
      let returnType = funcMatch[3]?.trim() ?? 'Promise<void>';

      // Ensure return type is wrapped in Promise
      if (!returnType.startsWith('Promise<')) {
        returnType = `Promise<${returnType}>`;
      }

      // Look for JSDoc comment above the function
      const jsdoc = extractJSDoc(lines, i);

      results.push({ name, params, returnType, ...(jsdoc !== undefined && { jsdoc }) });
      continue;
    }

    // Match: export const name = async (params): ReturnType =>
    const constMatch = line.match(
      /export\s+const\s+(\w+)\s*=\s*async\s*\(([^)]*)\)(?:\s*:\s*([^=]+?))?(?:\s*=>)/,
    );

    if (constMatch) {
      const name = constMatch[1]!;
      const params = constMatch[2]!.trim();
      let returnType = constMatch[3]?.trim() ?? 'Promise<void>';

      if (!returnType.startsWith('Promise<')) {
        returnType = `Promise<${returnType}>`;
      }

      const jsdoc = extractJSDoc(lines, i);
      results.push({ name, params, returnType, ...(jsdoc !== undefined && { jsdoc }) });
    }
  }

  return results;
}

/**
 * Extract JSDoc comment above a function declaration.
 */
function extractJSDoc(lines: string[], funcLine: number): string | undefined {
  // Look backwards for a JSDoc comment
  let endLine = funcLine - 1;

  // Skip blank lines
  while (endLine >= 0 && lines[endLine]!.trim() === '') {
    endLine--;
  }

  if (endLine < 0 || !lines[endLine]!.trim().endsWith('*/')) {
    return undefined;
  }

  // Find the start of the JSDoc
  let startLine = endLine;
  while (startLine >= 0) {
    if (lines[startLine]!.trim().startsWith('/**')) {
      break;
    }
    startLine--;
  }

  if (startLine < 0) {
    return undefined;
  }

  return lines.slice(startLine, endLine + 1).join('\n');
}
