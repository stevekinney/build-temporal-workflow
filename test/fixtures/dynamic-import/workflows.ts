/**
 * Test fixture for dynamic imports.
 * Dynamic imports break workflow determinism because the module resolved
 * at runtime may differ between original execution and replay.
 */
import { proxyActivities } from '@temporalio/workflow';

const activities = proxyActivities<{
  getModuleName(): Promise<string>;
}>({
  startToCloseTimeout: '1 minute',
});

export async function dynamicImportWorkflow(): Promise<string> {
  const moduleName = await activities.getModuleName();
  // This dynamic import should be detected and rejected
  const module = await import(moduleName);
  return module.default;
}
