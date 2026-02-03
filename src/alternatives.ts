/**
 * Suggested alternatives for forbidden/non-deterministic patterns.
 *
 * Provides a mapping from forbidden APIs to their Temporal-safe replacements,
 * with descriptions and import paths.
 */

/**
 * A suggested alternative for a forbidden pattern.
 */
export interface Alternative {
  /**
   * The forbidden pattern or API.
   */
  forbidden: string;

  /**
   * The suggested replacement.
   */
  replacement: string;

  /**
   * Import path for the replacement.
   */
  importFrom: string;

  /**
   * Description of why this alternative should be used.
   */
  reason: string;

  /**
   * Example usage of the replacement.
   */
  example?: string;
}

/**
 * Map of forbidden patterns/modules to their Temporal-safe alternatives.
 */
export const FORBIDDEN_ALTERNATIVES: Record<string, Alternative> = {
  'crypto.randomUUID': {
    forbidden: 'crypto.randomUUID()',
    replacement: 'workflow.uuid4()',
    importFrom: '@temporalio/workflow',
    reason: 'crypto.randomUUID() generates random UUIDs that differ between replays.',
    example: "import { uuid4 } from '@temporalio/workflow';\nconst id = uuid4();",
  },
  'Date.now': {
    forbidden: 'Date.now()',
    replacement: 'workflow.currentTime()',
    importFrom: '@temporalio/workflow',
    reason: 'Date.now() returns current time which changes between replays.',
  },
  'new Date()': {
    forbidden: 'new Date()',
    replacement: 'new Date(workflow.currentTime())',
    importFrom: '@temporalio/workflow',
    reason: 'new Date() uses current time which changes between replays.',
  },
  'Math.random': {
    forbidden: 'Math.random()',
    replacement: 'workflow.random()',
    importFrom: '@temporalio/workflow',
    reason: 'Math.random() generates different values on each replay.',
  },
  setTimeout: {
    forbidden: 'setTimeout()',
    replacement: 'workflow.sleep()',
    importFrom: '@temporalio/workflow',
    reason: 'Native timers are not replay-safe.',
    example: "import { sleep } from '@temporalio/workflow';\nawait sleep('1 second');",
  },
  setInterval: {
    forbidden: 'setInterval()',
    replacement: 'workflow.sleep() in a loop',
    importFrom: '@temporalio/workflow',
    reason: 'Native intervals are not replay-safe.',
  },
  fetch: {
    forbidden: 'fetch()',
    replacement: 'Activity',
    importFrom: '@temporalio/workflow',
    reason: 'Network requests may return different results on replay.',
    example: 'Move fetch calls to an Activity function and call via proxyActivities().',
  },
  'crypto.randomBytes': {
    forbidden: 'crypto.randomBytes()',
    replacement: 'Activity or workflow.random()',
    importFrom: '@temporalio/workflow',
    reason: 'Generates random data that differs between replays.',
  },
  fs: {
    forbidden: 'fs (file system)',
    replacement: 'Activity',
    importFrom: '@temporalio/workflow',
    reason: 'File system operations are side effects that break replay.',
  },
  child_process: {
    forbidden: 'child_process',
    replacement: 'Activity',
    importFrom: '@temporalio/workflow',
    reason: 'Spawning processes is a side effect that breaks replay.',
  },
};

/**
 * Look up an alternative for a forbidden module or pattern.
 *
 * @param pattern - The forbidden pattern or module name
 * @returns The alternative if found, undefined otherwise
 */
export function getAlternative(pattern: string): Alternative | undefined {
  // Direct lookup
  if (FORBIDDEN_ALTERNATIVES[pattern]) {
    return FORBIDDEN_ALTERNATIVES[pattern];
  }

  // Try partial matching
  for (const [key, alt] of Object.entries(FORBIDDEN_ALTERNATIVES)) {
    if (pattern.includes(key) || key.includes(pattern)) {
      return alt;
    }
  }

  return undefined;
}

/**
 * Format an alternative as a helpful error message suffix.
 */
export function formatAlternative(alt: Alternative): string {
  let message = `Use ${alt.replacement} from ${alt.importFrom} instead.`;
  if (alt.example) {
    message += `\n\nExample:\n${alt.example}`;
  }
  return message;
}

/**
 * Get all known alternatives as a formatted list.
 */
export function listAlternatives(): string {
  const lines: string[] = ['Forbidden patterns and their alternatives:', ''];

  for (const alt of Object.values(FORBIDDEN_ALTERNATIVES)) {
    lines.push(`  ${alt.forbidden} -> ${alt.replacement}`);
    lines.push(`    Import: ${alt.importFrom}`);
    lines.push(`    Reason: ${alt.reason}`);
    lines.push('');
  }

  return lines.join('\n');
}
