/**
 * Basic workflow fixture for testing the bundler.
 */

import { proxyActivities, sleep } from '@temporalio/workflow';

// Define activity interface
interface Activities {
  greet(name: string): Promise<string>;
}

// Create activity proxies
const { greet } = proxyActivities<Activities>({
  startToCloseTimeout: '1 minute',
});

/**
 * Simple greeting workflow.
 */
export async function greetingWorkflow(name: string): Promise<string> {
  const greeting = await greet(name);
  await sleep('1 second');
  return greeting;
}

/**
 * Another workflow for testing multiple exports.
 */
export async function echoWorkflow(message: string): Promise<string> {
  return message;
}
