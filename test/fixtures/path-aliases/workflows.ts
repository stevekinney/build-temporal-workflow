/**
 * Test workflow using path aliases.
 */

import { greet } from '@utils/greet';

import { formatName } from '@/utils/format';

/**
 * Simple greeting workflow that uses a path-aliased utility.
 */
export async function greetingWorkflow(name: string): Promise<string> {
  return greet(name);
}

/**
 * Workflow that directly uses the format utility via a different alias.
 */
export async function formatWorkflow(name: string): Promise<string> {
  return formatName(name);
}
