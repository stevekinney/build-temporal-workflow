/**
 * Integration tests for TypeScript path alias support in bundling.
 */

import { resolve } from 'node:path';

import { describe, expect, it } from 'bun:test';

import { bundleWorkflowCode } from '../../../src/bundler';

const fixturesDir = resolve(__dirname);

describe('path-aliases bundling', () => {
  it('bundles workflow code with path aliases (esbuild)', async () => {
    const bundle = await bundleWorkflowCode({
      workflowsPath: resolve(fixturesDir, 'workflows.ts'),
      tsconfigPath: resolve(fixturesDir, 'tsconfig.json'),
      bundler: 'esbuild',
    });

    expect(bundle.code).toContain('greetingWorkflow');
    expect(bundle.code).toContain('Hello,');
    expect(bundle.code).toContain('__TEMPORAL__');
  });

  it('bundles workflow code with path aliases (bun)', async () => {
    const bundle = await bundleWorkflowCode({
      workflowsPath: resolve(fixturesDir, 'workflows.ts'),
      tsconfigPath: resolve(fixturesDir, 'tsconfig.json'),
      bundler: 'bun',
    });

    expect(bundle.code).toContain('greetingWorkflow');
    expect(bundle.code).toContain('Hello,');
    expect(bundle.code).toContain('__TEMPORAL__');
  });

  it('bundles with tsconfigPath: true (auto-detect)', async () => {
    const bundle = await bundleWorkflowCode({
      workflowsPath: resolve(fixturesDir, 'workflows.ts'),
      tsconfigPath: true,
    });

    expect(bundle.code).toContain('greetingWorkflow');
    expect(bundle.code).toContain('Hello,');
  });
});
