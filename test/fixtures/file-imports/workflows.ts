/**
 * Workflow fixture that imports static files.
 */

import { proxyActivities, sleep } from '@temporalio/workflow';

// Import static files
import config from './config.toml';
import dataYaml from './data.yaml';
import dataYml from './data.yml';
import notes from './notes.txt';
import readme from './readme.md';

// Define activity interface
interface Activities {
  greet(name: string): Promise<string>;
}

// Create activity proxies
const { greet } = proxyActivities<Activities>({
  startToCloseTimeout: '1 minute',
});

/**
 * Workflow that uses imported static files.
 */
export async function fileImportWorkflow(name: string): Promise<{
  greeting: string;
  readme: string;
  notes: string;
  config: unknown;
  dataYaml: unknown;
  dataYml: unknown;
}> {
  const greeting = await greet(name);
  await sleep('1 second');

  return {
    greeting,
    readme,
    notes,
    config,
    dataYaml,
    dataYml,
  };
}
