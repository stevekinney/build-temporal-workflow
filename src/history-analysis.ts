/**
 * Workflow history size estimation through static analysis.
 *
 * Analyzes workflow source code to detect patterns that could lead to
 * unbounded history growth, such as infinite loops with activity calls
 * or unbounded signal handlers.
 */

import { readFileSync } from 'node:fs';

/**
 * A potential history growth issue found in workflow code.
 */
export interface HistoryWarning {
  /**
   * Type of issue detected.
   */
  type: 'unbounded-loop' | 'unbounded-signal' | 'large-payload' | 'deep-recursion';

  /**
   * Human-readable description of the issue.
   */
  message: string;

  /**
   * File where the issue was found.
   */
  file?: string;

  /**
   * Line number where the issue starts.
   */
  line?: number;

  /**
   * Severity of the issue.
   */
  severity: 'error' | 'warning';

  /**
   * Suggested fix.
   */
  suggestion: string;
}

/**
 * Result of history size analysis.
 */
export interface HistoryAnalysisResult {
  /**
   * Whether any issues were found.
   */
  clean: boolean;

  /**
   * List of warnings found.
   */
  warnings: HistoryWarning[];
}

/**
 * Analyze workflow source code for patterns that could cause unbounded history growth.
 *
 * @example
 * ```typescript
 * import { analyzeHistorySize } from 'bundle-temporal-workflow';
 *
 * const result = analyzeHistorySize(workflowCode);
 *
 * if (!result.clean) {
 *   for (const warning of result.warnings) {
 *     console.warn(`[${warning.severity}] ${warning.message}`);
 *     console.warn(`  Fix: ${warning.suggestion}`);
 *   }
 * }
 * ```
 */
export function analyzeHistorySize(
  code: string,
  filePath?: string,
): HistoryAnalysisResult {
  const warnings: HistoryWarning[] = [];
  const lines = code.split('\n');

  // Detect unbounded while(true) loops with activity calls
  detectUnboundedLoops(code, lines, filePath, warnings);

  // Detect signal handlers that grow lists without bounds
  detectUnboundedSignalHandlers(code, lines, filePath, warnings);

  // Detect potentially large payloads
  detectLargePayloads(code, lines, filePath, warnings);

  // Detect deep recursion patterns
  detectDeepRecursion(code, lines, filePath, warnings);

  return {
    clean: warnings.length === 0,
    warnings,
  };
}

/**
 * Analyze a file for history size issues.
 */
export function analyzeFileHistorySize(filePath: string): HistoryAnalysisResult {
  const code = readFileSync(filePath, 'utf-8');
  return analyzeHistorySize(code, filePath);
}

/**
 * Detect while(true) or for(;;) loops that contain activity calls
 * without a continueAsNew pattern.
 */
function detectUnboundedLoops(
  code: string,
  _lines: string[],
  filePath: string | undefined,
  warnings: HistoryWarning[],
): void {
  // Match while(true), while(1), for(;;)
  const loopPattern = /\b(?:while\s*\(\s*(?:true|1)\s*\)|for\s*\(\s*;\s*;\s*\))/g;
  let match;

  while ((match = loopPattern.exec(code)) !== null) {
    const loopStart = match.index;
    const lineNum = getLineNumber(code, loopStart);

    // Check if the loop body contains activity calls but no continueAsNew
    const loopBody = extractBlock(code, loopStart);

    if (loopBody) {
      const hasActivityCall =
        loopBody.includes('proxyActivities') ||
        loopBody.includes('executeActivity') ||
        /\bactivities\.\w+\s*\(/i.test(loopBody);

      const hasContinueAsNew =
        loopBody.includes('continueAsNew') || loopBody.includes('makeContinueAsNewFunc');

      if (hasActivityCall && !hasContinueAsNew) {
        warnings.push({
          type: 'unbounded-loop',
          message:
            'Infinite loop with activity calls but no continueAsNew(). History will grow without bound.',
          ...(filePath !== undefined && { file: filePath }),
          line: lineNum,
          severity: 'error',
          suggestion:
            'Use workflow.continueAsNew() periodically to reset history. ' +
            'Check a counter or elapsed time and call continueAsNew() when appropriate.',
        });
      }
    }
  }
}

/**
 * Detect signal handlers that push to arrays without bounds checking.
 */
function detectUnboundedSignalHandlers(
  code: string,
  _lines: string[],
  filePath: string | undefined,
  warnings: HistoryWarning[],
): void {
  const signalPattern = /setHandler\s*\(\s*\w+\s*,/g;
  let match;

  while ((match = signalPattern.exec(code)) !== null) {
    const handlerStart = match.index;
    const lineNum = getLineNumber(code, handlerStart);
    const handlerBody = extractBlock(code, handlerStart);

    if (handlerBody && handlerBody.includes('.push(')) {
      // Check if there's any size limiting
      const hasSizeCheck =
        handlerBody.includes('.length') ||
        handlerBody.includes('.slice(') ||
        handlerBody.includes('.splice(') ||
        handlerBody.includes('maxSize') ||
        handlerBody.includes('MAX_');

      if (!hasSizeCheck) {
        warnings.push({
          type: 'unbounded-signal',
          message:
            'Signal handler appends to array without size limits. Repeated signals could cause unbounded memory growth.',
          ...(filePath !== undefined && { file: filePath }),
          line: lineNum,
          severity: 'warning',
          suggestion:
            'Add a maximum size check to the array and discard or process old entries.',
        });
      }
    }
  }
}

/**
 * Detect patterns that suggest large payloads being passed to activities.
 */
function detectLargePayloads(
  code: string,
  _lines: string[],
  filePath: string | undefined,
  warnings: HistoryWarning[],
): void {
  // Detect JSON.stringify of large objects passed to activities
  const jsonStringifyPattern = /JSON\.stringify\s*\([^)]*\)/g;
  let match;

  while ((match = jsonStringifyPattern.exec(code)) !== null) {
    const context = code.slice(
      Math.max(0, match.index - 200),
      Math.min(code.length, match.index + match[0].length + 200),
    );

    // Check if this is in an activity call context
    if (
      context.includes('proxyActivities') ||
      context.includes('activities.') ||
      context.includes('executeActivity')
    ) {
      const lineNum = getLineNumber(code, match.index);
      warnings.push({
        type: 'large-payload',
        message:
          'JSON.stringify used near activity call. Large serialized payloads increase history size.',
        ...(filePath !== undefined && { file: filePath }),
        line: lineNum,
        severity: 'warning',
        suggestion:
          'Consider passing references (IDs, keys) instead of full data objects to activities. ' +
          'Let activities fetch the data they need directly.',
      });
    }
  }
}

/**
 * Detect recursive workflow calls without depth limits.
 */
function detectDeepRecursion(
  code: string,
  _lines: string[],
  filePath: string | undefined,
  warnings: HistoryWarning[],
): void {
  // Detect child workflow calls inside workflow functions
  const childWorkflowPattern = /executeChild\s*\(|startChild\s*\(|childWorkflow\s*\(/g;
  let match;

  while ((match = childWorkflowPattern.exec(code)) !== null) {
    const context = code.slice(
      Math.max(0, match.index - 500),
      Math.min(code.length, match.index + 500),
    );

    // Check if this appears recursive (calling the same function)
    const funcNameMatch = context.match(/(?:export\s+)?(?:async\s+)?function\s+(\w+)/);
    if (funcNameMatch && context.includes(funcNameMatch[1]!)) {
      const hasDepthLimit =
        context.includes('depth') ||
        context.includes('maxDepth') ||
        context.includes('level') ||
        context.includes('maxLevel');

      if (!hasDepthLimit) {
        const lineNum = getLineNumber(code, match.index);
        warnings.push({
          type: 'deep-recursion',
          message:
            'Recursive child workflow call without apparent depth limit. This could create an unbounded workflow chain.',
          ...(filePath !== undefined && { file: filePath }),
          line: lineNum,
          severity: 'warning',
          suggestion:
            'Add a depth/level parameter and check it before spawning child workflows.',
        });
      }
    }
  }
}

/**
 * Get line number for a character offset.
 */
function getLineNumber(code: string, offset: number): number {
  let line = 1;
  for (let i = 0; i < offset && i < code.length; i++) {
    if (code[i] === '\n') line++;
  }
  return line;
}

/**
 * Extract a brace-delimited block starting near the given offset.
 */
function extractBlock(code: string, startOffset: number): string | undefined {
  // Find the first { after the start offset
  const braceStart = code.indexOf('{', startOffset);
  if (braceStart === -1) return undefined;

  let depth = 0;
  let i = braceStart;

  while (i < code.length) {
    if (code[i] === '{') depth++;
    if (code[i] === '}') depth--;
    if (depth === 0) {
      return code.slice(braceStart, i + 1);
    }
    i++;
  }

  return undefined;
}
