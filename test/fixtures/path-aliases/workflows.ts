/**
 * Test workflow using path aliases.
 */

// Import using path alias - this should be resolved by the tsconfig paths plugin
import { greet } from '@utils/greet';

/**
 * Simple greeting workflow that uses a path-aliased utility.
 */
export async function greetingWorkflow(name: string): Promise<string> {
  return greet(name);
}
