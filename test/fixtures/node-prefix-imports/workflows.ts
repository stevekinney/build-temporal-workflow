/**
 * Workflow that uses allowed builtins with node: prefix.
 * This should work because assert, url, and util are stubbed.
 */

import assert from 'node:assert';
import { URL } from 'node:url';
import { TextEncoder } from 'node:util';

export async function assertWorkflow(value: unknown): Promise<boolean> {
  assert(value !== null, 'Value must not be null');
  return true;
}

export async function urlWorkflow(urlString: string): Promise<string> {
  const url = new URL(urlString);
  return url.hostname;
}

export async function encoderWorkflow(text: string): Promise<number> {
  const encoder = new TextEncoder();
  const encoded = encoder.encode(text);
  return encoded.length;
}
