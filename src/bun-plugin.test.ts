/**
 * Tests for the Bun plugin.
 */

import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

import { afterAll, beforeAll, describe, expect, it } from 'bun:test';

import { temporalWorkflow } from './bun-plugin';

const fixturesDir = resolve(__dirname, '../test/fixtures');
const tempDir = resolve(__dirname, '../test/temp-bun-plugin');

describe('bun-plugin', () => {
  beforeAll(() => {
    if (!existsSync(tempDir)) {
      mkdirSync(tempDir, { recursive: true });
    }
  });

  afterAll(() => {
    if (existsSync(tempDir)) {
      rmSync(tempDir, { recursive: true });
    }
  });

  it('creates a plugin with the correct name', () => {
    const plugin = temporalWorkflow();
    expect(plugin.name).toBe('temporal-workflow');
  });

  it('supports custom identifier', () => {
    const plugin = temporalWorkflow({ identifier: 'custom' });
    expect(plugin.name).toBe('temporal-workflow');
  });

  it('bundles workflow code when used with Bun.build', async () => {
    // Create a test file that imports the workflow
    const testFile = join(tempDir, 'test-import.ts');
    const workflowPath = resolve(fixturesDir, 'basic-workflow/workflows.ts');

    writeFileSync(
      testFile,
      `import bundle from '${workflowPath}?workflow';
export { bundle };`,
    );

    const result = await Bun.build({
      entrypoints: [testFile],
      outdir: join(tempDir, 'out'),
      plugins: [temporalWorkflow()],
    });

    expect(result.success).toBe(true);
    expect(result.outputs.length).toBeGreaterThan(0);

    // Read the output and verify it contains the bundled workflow
    const output = await result.outputs[0]!.text();
    expect(output).toContain('__TEMPORAL__');
    expect(output).toContain('greetingWorkflow');
  });

  it('passes bundleOptions to bundleWorkflowCode', async () => {
    const testFile = join(tempDir, 'test-options.ts');
    const workflowPath = resolve(fixturesDir, 'basic-workflow/workflows.ts');

    writeFileSync(
      testFile,
      `import bundle from '${workflowPath}?workflow';
export { bundle };`,
    );

    const result = await Bun.build({
      entrypoints: [testFile],
      outdir: join(tempDir, 'out-options'),
      plugins: [
        temporalWorkflow({
          bundleOptions: {
            sourceMap: 'none',
          },
        }),
      ],
    });

    expect(result.success).toBe(true);
  });

  it('supports custom query parameter identifier', async () => {
    const testFile = join(tempDir, 'test-custom-id.ts');
    const workflowPath = resolve(fixturesDir, 'basic-workflow/workflows.ts');

    writeFileSync(
      testFile,
      `import bundle from '${workflowPath}?temporal';
export { bundle };`,
    );

    const result = await Bun.build({
      entrypoints: [testFile],
      outdir: join(tempDir, 'out-custom'),
      plugins: [temporalWorkflow({ identifier: 'temporal' })],
    });

    expect(result.success).toBe(true);

    const output = await result.outputs[0]!.text();
    expect(output).toContain('__TEMPORAL__');
  });
});
