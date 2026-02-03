/**
 * Activity proxy type validation.
 *
 * Validates that activity function signatures use JSON-serializable types,
 * since arguments and return values must be serializable by Temporal.
 */

import { readFileSync } from 'node:fs';

import type { TypeValidationResult } from './types';

/**
 * Types known to be non-serializable.
 */
const NON_SERIALIZABLE_TYPES = [
  'Function',
  'Symbol',
  'WeakMap',
  'WeakSet',
  'WeakRef',
  'RegExp',
  'Error',
  'Map',
  'Set',
  'Buffer',
  'Uint8Array',
  'Int8Array',
  'Uint16Array',
  'Int16Array',
  'Uint32Array',
  'Int32Array',
  'Float32Array',
  'Float64Array',
  'ArrayBuffer',
  'SharedArrayBuffer',
  'DataView',
  'ReadableStream',
  'WritableStream',
  'TransformStream',
];

/**
 * Validate activity function signatures for JSON serializability.
 *
 * Checks that activity parameters and return types are JSON-serializable,
 * which is required by Temporal's payload converter.
 *
 * @example
 * ```typescript
 * import { validateActivityTypes } from 'bundle-temporal-workflow';
 *
 * const result = validateActivityTypes('./src/activities.ts');
 *
 * if (!result.valid) {
 *   for (const activity of result.activities) {
 *     if (!activity.valid) {
 *       console.error(`${activity.name}: ${activity.errors.join(', ')}`);
 *     }
 *   }
 * }
 * ```
 */
export function validateActivityTypes(activitiesPath: string): TypeValidationResult {
  const code = readFileSync(activitiesPath, 'utf-8');
  return validateActivityTypesFromSource(code);
}

/**
 * Validate activity types from source code string.
 */
export function validateActivityTypesFromSource(code: string): TypeValidationResult {
  const activities = extractActivitySignatures(code);
  let allValid = true;

  for (const activity of activities) {
    const errors: string[] = [];

    // Check parameter types
    for (const param of activity.params) {
      const typeIssue = checkSerializability(param.type);
      if (typeIssue) {
        errors.push(`Parameter "${param.name}": ${typeIssue}`);
      }
    }

    // Check return type
    if (activity.returnType) {
      const returnIssue = checkSerializability(activity.returnType);
      if (returnIssue) {
        errors.push(`Return type: ${returnIssue}`);
      }
    }

    activity.errors = errors;
    activity.valid = errors.length === 0;
    if (!activity.valid) allValid = false;
  }

  return {
    valid: allValid,
    activities: activities.map((a) => ({
      name: a.name,
      valid: a.valid,
      errors: a.errors,
    })),
  };
}

interface ActivitySignature {
  name: string;
  params: Array<{ name: string; type: string }>;
  returnType: string | undefined;
  valid: boolean;
  errors: string[];
}

/**
 * Extract activity function signatures from source code.
 */
function extractActivitySignatures(code: string): ActivitySignature[] {
  const results: ActivitySignature[] = [];

  // Match exported functions
  const funcPattern =
    /export\s+(?:async\s+)?function\s+(\w+)\s*\(([^)]*)\)(?:\s*:\s*([^{]+?))?(?:\s*\{)/g;
  let match;

  while ((match = funcPattern.exec(code)) !== null) {
    const name = match[1]!;
    const paramsStr = match[2]!.trim();
    const returnType = match[3]?.trim();

    const params = parseParams(paramsStr);

    results.push({
      name,
      params,
      returnType: returnType ? cleanType(returnType) : undefined,
      valid: true,
      errors: [],
    });
  }

  return results;
}

/**
 * Parse function parameter string into name/type pairs.
 */
function parseParams(paramsStr: string): Array<{ name: string; type: string }> {
  if (!paramsStr) return [];

  const params: Array<{ name: string; type: string }> = [];
  const parts = splitParams(paramsStr);

  for (const part of parts) {
    const colonIndex = part.indexOf(':');
    if (colonIndex !== -1) {
      const name = part.slice(0, colonIndex).trim();
      const type = part.slice(colonIndex + 1).trim();
      params.push({ name, type: cleanType(type) });
    } else {
      params.push({ name: part.trim(), type: 'unknown' });
    }
  }

  return params;
}

/**
 * Split parameter string respecting nested generics.
 */
function splitParams(str: string): string[] {
  const results: string[] = [];
  let depth = 0;
  let current = '';

  for (const char of str) {
    if (char === '<' || char === '(') depth++;
    if (char === '>' || char === ')') depth--;
    if (char === ',' && depth === 0) {
      results.push(current);
      current = '';
    } else {
      current += char;
    }
  }

  if (current.trim()) {
    results.push(current);
  }

  return results;
}

/**
 * Clean up a type string for analysis.
 */
function cleanType(type: string): string {
  return type.replace(/Promise\s*<(.+)>/, '$1').trim();
}

/**
 * Check if a type annotation suggests a non-serializable type.
 */
function checkSerializability(typeStr: string): string | undefined {
  for (const nonSerializable of NON_SERIALIZABLE_TYPES) {
    if (typeStr.includes(nonSerializable)) {
      return (
        `Type "${typeStr}" includes non-JSON-serializable type "${nonSerializable}". ` +
        'Activity parameters and return values must be JSON-serializable.'
      );
    }
  }

  // Check for function types
  if (typeStr.includes('=>') || typeStr.includes('Function')) {
    return `Type "${typeStr}" appears to be a function type. Functions cannot be serialized by Temporal.`;
  }

  return undefined;
}
