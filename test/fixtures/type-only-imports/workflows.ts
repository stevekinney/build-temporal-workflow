/**
 * Test fixture for type-only imports.
 * Type-only imports of forbidden modules should be allowed because they're
 * erased at compile time and don't affect runtime behavior.
 */
// Type-only import of fs (normally forbidden)
import type { Stats } from 'node:fs';

// Type-only import of @temporalio/activity (normally forbidden)
import type { Context } from '@temporalio/activity';
import { proxyActivities } from '@temporalio/workflow';

// Interface using the imported types
export interface FileInfo {
  stats: Stats;
  context: Context;
}

const activities = proxyActivities<{
  greet(name: string): Promise<string>;
}>({
  startToCloseTimeout: '1 minute',
});

export async function typeOnlyWorkflow(name: string): Promise<string> {
  return activities.greet(name);
}
