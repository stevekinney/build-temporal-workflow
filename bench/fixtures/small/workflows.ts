/**
 * Small fixture: ~5 modules, baseline benchmark.
 *
 * This is a minimal workflow setup to establish baseline performance.
 */

import { proxyActivities, sleep } from '@temporalio/workflow';

// Activity interface
interface Activities {
  greet(name: string): Promise<string>;
  sendEmail(to: string, subject: string): Promise<void>;
}

// Create activity proxies
const { greet, sendEmail } = proxyActivities<Activities>({
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
 * Email notification workflow.
 */
export async function notificationWorkflow(
  email: string,
  message: string,
): Promise<void> {
  await sendEmail(email, message);
}
