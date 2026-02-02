/**
 * Test fixture for transitive forbidden module imports.
 * Tests that forbidden modules are detected even when imported
 * through intermediate modules (like issue-516 in SDK).
 */
import { proxyActivities } from '@temporalio/workflow';

// Import from our helper which imports a forbidden module
import { getHostInfo } from './helper';

const activities = proxyActivities<{
  logInfo(info: string): Promise<void>;
}>({
  startToCloseTimeout: '1 minute',
});

export async function transitiveWorkflow(): Promise<string> {
  const info = getHostInfo();
  await activities.logInfo(info);
  return info;
}
