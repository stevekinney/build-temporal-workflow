/**
 * Workflows using Deno-style import map aliases.
 */

import { sleep } from '@temporalio/workflow';
// Using import map alias from deno.json
import { formatGreeting } from 'workflow-helpers';

export async function greetingWorkflow(name: string): Promise<string> {
  await sleep(100);
  return formatGreeting(name);
}
