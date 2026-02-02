/**
 * Tests for workflow manifest generation.
 */

import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

import { afterAll, beforeAll, describe, expect, it } from 'bun:test';

import {
  compareManifests,
  generateManifest,
  parseManifest,
  serializeManifest,
} from './manifest';
import type { WorkflowManifest } from './types';

const tempDir = resolve(__dirname, '../test/temp-manifest');

describe('manifest', () => {
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

  describe('generateManifest', () => {
    it('generates a manifest with basic workflow info', () => {
      // Create a test workflow file
      const workflowsPath = join(tempDir, 'test-workflows.ts');
      writeFileSync(
        workflowsPath,
        `
export async function orderWorkflow(orderId: string) {
  return { orderId, status: 'completed' };
}

export async function userWorkflow(userId: string) {
  return { userId, active: true };
}
      `,
      );

      const manifest = generateManifest({
        workflowsPath,
        bundleCode: 'mock bundle code',
      });

      expect(manifest.version).toBe(1);
      expect(manifest.generatedAt).toBeDefined();
      expect(manifest.bundleHash).toBeDefined();
      expect(manifest.sourcePath).toBe(workflowsPath);

      // Should have extracted both workflows
      expect(manifest.workflows.length).toBe(2);
      expect(manifest.workflows.map((w) => w.name)).toContain('orderWorkflow');
      expect(manifest.workflows.map((w) => w.name)).toContain('userWorkflow');
    });

    it('includes source hashes by default', () => {
      const workflowsPath = join(tempDir, 'hashed-workflows.ts');
      writeFileSync(
        workflowsPath,
        `
export async function myWorkflow() {
  return 'hello';
}
      `,
      );

      const manifest = generateManifest({
        workflowsPath,
        bundleCode: 'mock bundle code',
      });

      expect(manifest.workflows[0]?.sourceHash).toBeDefined();
      expect(manifest.workflows[0]?.sourceHash?.length).toBe(8);
    });

    it('excludes source hashes when includeSourceHashes is false', () => {
      const workflowsPath = join(tempDir, 'no-hash-workflows.ts');
      writeFileSync(
        workflowsPath,
        `
export async function myWorkflow() {
  return 'hello';
}
      `,
      );

      const manifest = generateManifest({
        workflowsPath,
        bundleCode: 'mock bundle code',
        includeSourceHashes: false,
      });

      expect(manifest.workflows[0]?.sourceHash).toBeUndefined();
    });

    it('includes line numbers for workflows', () => {
      const workflowsPath = join(tempDir, 'lined-workflows.ts');
      writeFileSync(
        workflowsPath,
        `// Comment
// Another comment
export async function myWorkflow() {
  return 'hello';
}
      `,
      );

      const manifest = generateManifest({
        workflowsPath,
        bundleCode: 'mock bundle code',
      });

      expect(manifest.workflows[0]?.line).toBe(3);
    });

    it('extracts named exports', () => {
      const workflowsPath = join(tempDir, 'named-exports.ts');
      writeFileSync(
        workflowsPath,
        `
async function internalWorkflow() {
  return 'internal';
}

export { internalWorkflow as publicWorkflow };
      `,
      );

      const manifest = generateManifest({
        workflowsPath,
        bundleCode: 'mock bundle code',
      });

      expect(manifest.workflows.map((w) => w.name)).toContain('publicWorkflow');
    });

    it('ignores internal functions starting with underscore', () => {
      const workflowsPath = join(tempDir, 'internal-workflows.ts');
      writeFileSync(
        workflowsPath,
        `
export async function publicWorkflow() {
  return _helper();
}

export async function _helper() {
  return 'helper';
}
      `,
      );

      const manifest = generateManifest({
        workflowsPath,
        bundleCode: 'mock bundle code',
      });

      // Should only have publicWorkflow, not _helper
      expect(manifest.workflows.length).toBe(1);
      expect(manifest.workflows[0]?.name).toBe('publicWorkflow');
    });

    it('handles non-existent path gracefully', () => {
      const manifest = generateManifest({
        workflowsPath: '/non/existent/path.ts',
        bundleCode: 'mock bundle code',
      });

      expect(manifest.workflows).toEqual([]);
    });
  });

  describe('serializeManifest and parseManifest', () => {
    it('round-trips a manifest correctly', () => {
      const original: WorkflowManifest = {
        version: 1,
        generatedAt: new Date().toISOString(),
        bundleHash: 'abc123',
        workflows: [
          { name: 'workflow1', sourceHash: 'hash1', line: 10 },
          { name: 'workflow2', sourceHash: 'hash2', line: 20 },
        ],
        sdkVersion: '1.14.0',
        bundlerVersion: '1.0.0',
        sourcePath: '/path/to/workflows.ts',
      };

      const serialized = serializeManifest(original);
      const parsed = parseManifest(serialized);

      expect(parsed).toEqual(original);
    });

    it('produces valid JSON', () => {
      const manifest: WorkflowManifest = {
        version: 1,
        generatedAt: new Date().toISOString(),
        bundleHash: 'abc123',
        workflows: [],
      };

      const serialized = serializeManifest(manifest);

      expect(() => JSON.parse(serialized)).not.toThrow();
    });

    it('throws for unsupported version', () => {
      const badJson = JSON.stringify({ version: 99, workflows: [] });

      expect(() => parseManifest(badJson)).toThrow('Unsupported manifest version');
    });
  });

  describe('compareManifests', () => {
    it('detects bundle hash changes', () => {
      const old: WorkflowManifest = {
        version: 1,
        generatedAt: new Date().toISOString(),
        bundleHash: 'hash1',
        workflows: [],
      };

      const newer: WorkflowManifest = {
        version: 1,
        generatedAt: new Date().toISOString(),
        bundleHash: 'hash2',
        workflows: [],
      };

      const diff = compareManifests(old, newer);

      expect(diff.bundleChanged).toBe(true);
    });

    it('detects added workflows', () => {
      const old: WorkflowManifest = {
        version: 1,
        generatedAt: new Date().toISOString(),
        bundleHash: 'hash1',
        workflows: [{ name: 'existingWorkflow' }],
      };

      const newer: WorkflowManifest = {
        version: 1,
        generatedAt: new Date().toISOString(),
        bundleHash: 'hash1',
        workflows: [{ name: 'existingWorkflow' }, { name: 'newWorkflow' }],
      };

      const diff = compareManifests(old, newer);

      expect(diff.workflowsAdded).toEqual(['newWorkflow']);
    });

    it('detects removed workflows', () => {
      const old: WorkflowManifest = {
        version: 1,
        generatedAt: new Date().toISOString(),
        bundleHash: 'hash1',
        workflows: [{ name: 'workflow1' }, { name: 'workflow2' }],
      };

      const newer: WorkflowManifest = {
        version: 1,
        generatedAt: new Date().toISOString(),
        bundleHash: 'hash1',
        workflows: [{ name: 'workflow1' }],
      };

      const diff = compareManifests(old, newer);

      expect(diff.workflowsRemoved).toEqual(['workflow2']);
    });

    it('detects modified workflows', () => {
      const old: WorkflowManifest = {
        version: 1,
        generatedAt: new Date().toISOString(),
        bundleHash: 'hash1',
        workflows: [{ name: 'myWorkflow', sourceHash: 'hash1' }],
      };

      const newer: WorkflowManifest = {
        version: 1,
        generatedAt: new Date().toISOString(),
        bundleHash: 'hash1',
        workflows: [{ name: 'myWorkflow', sourceHash: 'hash2' }],
      };

      const diff = compareManifests(old, newer);

      expect(diff.workflowsModified).toEqual(['myWorkflow']);
    });

    it('handles no changes', () => {
      const manifest: WorkflowManifest = {
        version: 1,
        generatedAt: new Date().toISOString(),
        bundleHash: 'hash1',
        workflows: [{ name: 'workflow1', sourceHash: 'abc' }],
      };

      const diff = compareManifests(manifest, manifest);

      expect(diff.bundleChanged).toBe(false);
      expect(diff.workflowsAdded).toEqual([]);
      expect(diff.workflowsRemoved).toEqual([]);
      expect(diff.workflowsModified).toEqual([]);
    });
  });
});
