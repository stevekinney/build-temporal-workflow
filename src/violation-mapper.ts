/**
 * Source map-aware violation tracing.
 *
 * Maps determinism violations back to their original source locations
 * using source maps, providing actionable error messages that point
 * to the exact line in the original TypeScript file.
 */

import type { ReplayViolation } from './replay-safety';

/**
 * A violation with source-mapped location information.
 */
export interface MappedViolation extends ReplayViolation {
  /**
   * Original source file path (from source map).
   */
  originalFile?: string;

  /**
   * Original line number (from source map).
   */
  originalLine?: number;

  /**
   * Original column number (from source map).
   */
  originalColumn?: number;

  /**
   * Original source line content.
   */
  originalSourceLine?: string;
}

/**
 * Parsed source map structure (simplified).
 */
interface SourceMap {
  version: number;
  sources: string[];
  sourcesContent?: (string | null)[];
  mappings: string;
  names?: string[];
}

/**
 * A single decoded source map mapping.
 */
interface Mapping {
  generatedLine: number;
  generatedColumn: number;
  sourceIndex: number;
  originalLine: number;
  originalColumn: number;
}

/**
 * Map violations to their original source locations using a source map.
 *
 * @example
 * ```typescript
 * import { analyzeReplaySafety, mapViolationsToSource } from 'bundle-temporal-workflow';
 *
 * const result = analyzeReplaySafety(bundleCode);
 * const mapped = mapViolationsToSource(result.violations, sourceMapJson);
 *
 * for (const v of mapped) {
 *   const file = v.originalFile ?? v.file;
 *   const line = v.originalLine ?? v.line;
 *   console.log(`${file}:${line} - ${v.pattern.name}`);
 * }
 * ```
 */
export function mapViolationsToSource(
  violations: ReplayViolation[],
  sourceMapJson: string,
): MappedViolation[] {
  let sourceMap: SourceMap;
  try {
    sourceMap = JSON.parse(sourceMapJson) as SourceMap;
  } catch {
    // If source map is invalid, return violations as-is
    return violations.map((v) => ({ ...v }));
  }

  const mappings = decodeMappings(sourceMap.mappings);

  return violations.map((violation) => {
    const mapped: MappedViolation = { ...violation };

    // Find the closest mapping for this violation's line/column
    const mapping = findClosestMapping(mappings, violation.line, violation.column);

    if (mapping && mapping.sourceIndex < sourceMap.sources.length) {
      const sourceFile = sourceMap.sources[mapping.sourceIndex];
      if (sourceFile !== undefined) {
        mapped.originalFile = sourceFile;
      }
      mapped.originalLine = mapping.originalLine;
      mapped.originalColumn = mapping.originalColumn;

      // Try to get original source line
      if (sourceMap.sourcesContent?.[mapping.sourceIndex]) {
        const lines = sourceMap.sourcesContent[mapping.sourceIndex]!.split('\n');
        if (mapping.originalLine > 0 && mapping.originalLine <= lines.length) {
          const sourceLine = lines[mapping.originalLine - 1];
          if (sourceLine !== undefined) {
            mapped.originalSourceLine = sourceLine;
          }
        }
      }
    }

    return mapped;
  });
}

/**
 * Format mapped violations for display.
 */
export function formatMappedViolations(violations: MappedViolation[]): string {
  if (violations.length === 0) {
    return 'No violations found.';
  }

  const lines: string[] = [];

  for (const v of violations) {
    const severity = v.pattern.severity === 'error' ? 'ERROR' : 'WARNING';
    const file = v.originalFile ?? v.file ?? 'unknown';
    const line = v.originalLine ?? v.line;
    const col = v.originalColumn ?? v.column;
    const sourceLine = v.originalSourceLine ?? v.sourceLine;

    lines.push(`[${severity}] ${file}:${line}:${col}: ${v.pattern.name}`);
    if (sourceLine) {
      lines.push(`  ${sourceLine.trim()}`);
    }
    lines.push(`  ${v.pattern.suggestion}`);
    lines.push('');
  }

  return lines.join('\n');
}

/**
 * Decode VLQ-encoded source map mappings (simplified decoder).
 */
function decodeMappings(mappingsStr: string): Mapping[] {
  const result: Mapping[] = [];
  const lines = mappingsStr.split(';');

  let generatedColumn = 0;
  let sourceIndex = 0;
  let originalLine = 0;
  let originalColumn = 0;

  for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
    const line = lines[lineIndex]!;
    if (!line) continue;

    generatedColumn = 0;
    const segments = line.split(',');

    for (const segment of segments) {
      if (!segment) continue;

      const values = decodeVLQ(segment);
      if (values.length < 4) continue;

      generatedColumn += values[0]!;
      sourceIndex += values[1]!;
      originalLine += values[2]!;
      originalColumn += values[3]!;

      result.push({
        generatedLine: lineIndex + 1,
        generatedColumn: generatedColumn + 1,
        sourceIndex,
        originalLine: originalLine + 1,
        originalColumn: originalColumn + 1,
      });
    }
  }

  return result;
}

/**
 * Decode a single VLQ segment.
 */
function decodeVLQ(segment: string): number[] {
  const VLQ_BASE_SHIFT = 5;
  const VLQ_BASE = 1 << VLQ_BASE_SHIFT;
  const VLQ_BASE_MASK = VLQ_BASE - 1;
  const VLQ_CONTINUATION_BIT = VLQ_BASE;

  const CHAR_MAP = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

  const result: number[] = [];
  let shift = 0;
  let value = 0;

  for (let i = 0; i < segment.length; i++) {
    const charIndex = CHAR_MAP.indexOf(segment[i]!);
    if (charIndex === -1) break;

    const hasContinuation = charIndex & VLQ_CONTINUATION_BIT;
    value += (charIndex & VLQ_BASE_MASK) << shift;

    if (hasContinuation) {
      shift += VLQ_BASE_SHIFT;
    } else {
      const isNegative = value & 1;
      value >>= 1;
      result.push(isNegative ? -value : value);
      value = 0;
      shift = 0;
    }
  }

  return result;
}

/**
 * Find the closest source map mapping for a given generated position.
 */
function findClosestMapping(
  mappings: Mapping[],
  line: number,
  column: number,
): Mapping | undefined {
  let closest: Mapping | undefined;
  let closestDistance = Infinity;

  for (const mapping of mappings) {
    if (mapping.generatedLine === line) {
      const distance = Math.abs(mapping.generatedColumn - column);
      if (distance < closestDistance) {
        closest = mapping;
        closestDistance = distance;
      }
    }
  }

  // If no exact line match, find nearest line
  if (!closest) {
    for (const mapping of mappings) {
      const distance =
        Math.abs(mapping.generatedLine - line) * 1000 +
        Math.abs(mapping.generatedColumn - column);
      if (distance < closestDistance) {
        closest = mapping;
        closestDistance = distance;
      }
    }
  }

  return closest;
}
