/**
 * Workflow that imports a forbidden module (fs).
 * This should fail bundling.
 */

import { readFileSync } from 'node:fs';

export async function badWorkflow(): Promise<string> {
  // This should never execute - bundling should fail
  return readFileSync('/etc/passwd', 'utf-8');
}
