/**
 * Static analysis for detecting replay-unsafe patterns in workflow code.
 *
 * Temporal workflows must be deterministic - they should produce the same
 * results when replayed. This module detects common patterns that break
 * this requirement.
 */

import { readFileSync } from 'node:fs';

/**
 * A pattern that may break workflow determinism.
 */
export interface ReplayUnsafePattern {
  /**
   * Regex pattern to match in source code.
   */
  pattern: RegExp;

  /**
   * Human-readable name for this pattern.
   */
  name: string;

  /**
   * Explanation of why this pattern is unsafe.
   */
  reason: string;

  /**
   * Suggested fix or alternative.
   */
  suggestion: string;

  /**
   * Severity level.
   */
  severity: 'error' | 'warning';
}

/**
 * Built-in patterns that are known to break replay determinism.
 */
export const REPLAY_UNSAFE_PATTERNS: ReplayUnsafePattern[] = [
  {
    pattern: /\bDate\.now\s*\(/g,
    name: 'Date.now()',
    reason: 'Returns current time, which changes between original execution and replay.',
    suggestion: 'Use workflow.currentTime() from @temporalio/workflow instead.',
    severity: 'error',
  },
  {
    pattern: /\bnew\s+Date\s*\(\s*\)/g,
    name: 'new Date()',
    reason: 'Creates a date with current time, which changes between replays.',
    suggestion: 'Use workflow.currentTime() for the current time.',
    severity: 'error',
  },
  {
    pattern: /\bMath\.random\s*\(/g,
    name: 'Math.random()',
    reason: 'Random values differ between original execution and replay.',
    suggestion: 'Use workflow.random() from @temporalio/workflow instead.',
    severity: 'error',
  },
  {
    pattern: /(?<!\.)(?<!workflow\.)\bsetTimeout\s*\(/g,
    name: 'setTimeout()',
    reason: 'Native timers are not replay-safe and may fire at wrong times.',
    suggestion: 'Use workflow.sleep() from @temporalio/workflow instead.',
    severity: 'error',
  },
  {
    pattern: /(?<!\.)(?<!workflow\.)\bsetInterval\s*\(/g,
    name: 'setInterval()',
    reason: 'Native intervals are not replay-safe.',
    suggestion:
      'Use a loop with workflow.sleep() or workflow.condition() with periodic checks.',
    severity: 'error',
  },
  {
    pattern: /\bfetch\s*\(/g,
    name: 'fetch()',
    reason: 'Network requests may return different results on replay.',
    suggestion:
      'Move network calls to Activities, which are recorded and replayed correctly.',
    severity: 'error',
  },
  {
    pattern: /\baxios\s*[.(]/g,
    name: 'axios',
    reason: 'HTTP client calls may return different results on replay.',
    suggestion: 'Move HTTP calls to Activities.',
    severity: 'warning',
  },
  {
    pattern: /\bcrypto\.randomBytes\s*\(/g,
    name: 'crypto.randomBytes()',
    reason: 'Generates random data that differs between replays.',
    suggestion:
      'Use workflow.random() or move to an Activity for cryptographic operations.',
    severity: 'error',
  },
  {
    pattern: /\bcrypto\.randomUUID\s*\(/g,
    name: 'crypto.randomUUID()',
    reason: 'Generates random UUIDs that differ between replays.',
    suggestion: 'Use workflow.uuid4() from @temporalio/workflow instead.',
    severity: 'error',
  },
  {
    pattern: /\buuidv4\s*\(/g,
    name: 'uuidv4()',
    reason: 'Generates random UUIDs that differ between replays.',
    suggestion: 'Use workflow.uuid4() from @temporalio/workflow instead.',
    severity: 'warning',
  },
  {
    pattern: /\bprocess\.env\b/g,
    name: 'process.env',
    reason: 'Environment variables may differ between workflow environments.',
    suggestion:
      'Pass configuration as workflow input or use searchAttributes for runtime config.',
    severity: 'warning',
  },
  {
    pattern: /\bfs\.(read|write|append|unlink|mkdir|rmdir)/g,
    name: 'fs operations',
    reason: 'File system operations are side effects that break replay.',
    suggestion: 'Move file operations to Activities.',
    severity: 'error',
  },
  {
    pattern: /\bchild_process\b/g,
    name: 'child_process',
    reason: 'Spawning processes is a side effect that breaks replay.',
    suggestion: 'Move process spawning to Activities.',
    severity: 'error',
  },
  {
    pattern: /\bWebSocket\s*\(/g,
    name: 'WebSocket',
    reason: 'WebSocket connections are side effects that break replay.',
    suggestion: 'Move WebSocket communication to Activities.',
    severity: 'error',
  },
  {
    pattern: /\bXMLHttpRequest\b/g,
    name: 'XMLHttpRequest',
    reason: 'HTTP requests may return different results on replay.',
    suggestion: 'Move HTTP calls to Activities.',
    severity: 'error',
  },
];

/**
 * A single violation found in the source code.
 */
export interface ReplayViolation {
  /**
   * The pattern that was violated.
   */
  pattern: ReplayUnsafePattern;

  /**
   * The matched text in the source.
   */
  match: string;

  /**
   * Line number (1-indexed).
   */
  line: number;

  /**
   * Column number (1-indexed).
   */
  column: number;

  /**
   * The full line of source code.
   */
  sourceLine: string;

  /**
   * File path where the violation was found.
   */
  file?: string | undefined;
}

/**
 * Result of replay safety analysis.
 */
export interface ReplaySafetyResult {
  /**
   * Whether the code is replay-safe (no errors found).
   */
  safe: boolean;

  /**
   * All violations found.
   */
  violations: ReplayViolation[];

  /**
   * Error-level violations (definitely break replay).
   */
  errors: ReplayViolation[];

  /**
   * Warning-level violations (might break replay).
   */
  warnings: ReplayViolation[];
}

/**
 * Options for replay safety analysis.
 */
export interface AnalyzeReplaySafetyOptions {
  /**
   * Additional patterns to check for (beyond built-in patterns).
   */
  additionalPatterns?: ReplayUnsafePattern[];

  /**
   * Patterns to skip (by name).
   */
  skipPatterns?: string[];

  /**
   * File path (for error reporting).
   */
  filePath?: string;

  /**
   * Whether to include only errors (not warnings).
   * Default: false
   */
  errorsOnly?: boolean;
}

/**
 * Analyze source code for replay-unsafe patterns.
 *
 * @example
 * ```typescript
 * import { analyzeReplaySafety } from 'bundle-temporal-workflow';
 *
 * const code = `
 *   export async function myWorkflow() {
 *     const now = Date.now(); // This will be flagged!
 *     return now;
 *   }
 * `;
 *
 * const result = analyzeReplaySafety(code);
 *
 * if (!result.safe) {
 *   console.error('Found replay-unsafe patterns:');
 *   for (const violation of result.violations) {
 *     console.error(`  Line ${violation.line}: ${violation.pattern.name}`);
 *     console.error(`    ${violation.pattern.suggestion}`);
 *   }
 * }
 * ```
 */
export function analyzeReplaySafety(
  code: string,
  options: AnalyzeReplaySafetyOptions = {},
): ReplaySafetyResult {
  const violations: ReplayViolation[] = [];

  // Combine built-in and additional patterns
  let patterns = [...REPLAY_UNSAFE_PATTERNS, ...(options.additionalPatterns ?? [])];

  // Filter out skipped patterns
  if (options.skipPatterns?.length) {
    patterns = patterns.filter((p) => !options.skipPatterns!.includes(p.name));
  }

  // Filter to errors only if requested
  if (options.errorsOnly) {
    patterns = patterns.filter((p) => p.severity === 'error');
  }

  // Split code into lines for position tracking
  const lines = code.split('\n');

  // Build a map of character offset to line/column
  const offsetToPosition = buildOffsetMap(lines);

  for (const pattern of patterns) {
    // Clone regex to reset lastIndex
    const regex = new RegExp(pattern.pattern.source, pattern.pattern.flags);

    let match;
    while ((match = regex.exec(code)) !== null) {
      const position = offsetToPosition(match.index);

      // Skip if this looks like it's in a comment
      if (isInComment(code, match.index)) {
        continue;
      }

      // Skip if this looks like it's in a string that's being type-checked
      if (isInTypeContext(code, match.index)) {
        continue;
      }

      violations.push({
        pattern,
        match: match[0],
        line: position.line,
        column: position.column,
        sourceLine: lines[position.line - 1] ?? '',
        file: options.filePath,
      });
    }
  }

  // Sort by line number
  violations.sort((a, b) => a.line - b.line || a.column - b.column);

  const errors = violations.filter((v) => v.pattern.severity === 'error');
  const warnings = violations.filter((v) => v.pattern.severity === 'warning');

  return {
    safe: errors.length === 0,
    violations,
    errors,
    warnings,
  };
}

/**
 * Analyze a file for replay-unsafe patterns.
 */
export function analyzeFileReplaySafety(
  filePath: string,
  options: Omit<AnalyzeReplaySafetyOptions, 'filePath'> = {},
): ReplaySafetyResult {
  const code = readFileSync(filePath, 'utf-8');
  return analyzeReplaySafety(code, { ...options, filePath });
}

/**
 * Build a function that converts character offset to line/column.
 */
function buildOffsetMap(
  lines: string[],
): (offset: number) => { line: number; column: number } {
  const lineStarts: number[] = [0];
  let total = 0;

  for (const line of lines) {
    total += line.length + 1; // +1 for newline
    lineStarts.push(total);
  }

  return (offset: number) => {
    // Binary search for the line
    let low = 0;
    let high = lineStarts.length - 1;

    while (low < high) {
      const mid = Math.floor((low + high + 1) / 2);
      if (lineStarts[mid]! <= offset) {
        low = mid;
      } else {
        high = mid - 1;
      }
    }

    return {
      line: low + 1, // 1-indexed
      column: offset - lineStarts[low]! + 1, // 1-indexed
    };
  };
}

/**
 * Check if the given offset is inside a comment.
 */
function isInComment(code: string, offset: number): boolean {
  // Find the start of the line
  let lineStart = offset;
  while (lineStart > 0 && code[lineStart - 1] !== '\n') {
    lineStart--;
  }

  // Check for single-line comment
  const linePrefix = code.slice(lineStart, offset);
  if (linePrefix.includes('//')) {
    return true;
  }

  // Check for multi-line comment (simplified check)
  const beforeOffset = code.slice(0, offset);
  const lastBlockOpen = beforeOffset.lastIndexOf('/*');
  const lastBlockClose = beforeOffset.lastIndexOf('*/');

  return lastBlockOpen > lastBlockClose;
}

/**
 * Check if the offset is in a type context (type annotation, etc.).
 */
function isInTypeContext(code: string, offset: number): boolean {
  // Find the line containing this offset
  let lineStart = offset;
  while (lineStart > 0 && code[lineStart - 1] !== '\n') {
    lineStart--;
  }

  let lineEnd = offset;
  while (lineEnd < code.length && code[lineEnd] !== '\n') {
    lineEnd++;
  }

  const line = code.slice(lineStart, lineEnd);

  // Check if this looks like a type annotation
  // e.g., "variable: Date", "param: Date.now", etc.
  if (line.match(/:\s*\w+/) && !line.includes('=')) {
    return true;
  }

  return false;
}

/**
 * Format violations for display.
 */
export function formatReplayViolations(violations: ReplayViolation[]): string {
  if (violations.length === 0) {
    return 'No replay-unsafe patterns found.';
  }

  const lines: string[] = [];

  for (const v of violations) {
    const severity = v.pattern.severity === 'error' ? 'ERROR' : 'WARNING';
    const location = v.file ? `${v.file}:${v.line}:${v.column}` : `Line ${v.line}`;

    lines.push(`[${severity}] ${location}: ${v.pattern.name}`);
    lines.push(`  ${v.sourceLine.trim()}`);
    lines.push(`  ${v.pattern.reason}`);
    lines.push(`  Suggestion: ${v.pattern.suggestion}`);
    lines.push('');
  }

  return lines.join('\n');
}
