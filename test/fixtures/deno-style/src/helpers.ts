/**
 * Helper functions for workflows.
 */

export function formatGreeting(name: string): string {
  return `Hello, ${name}!`;
}

export function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
