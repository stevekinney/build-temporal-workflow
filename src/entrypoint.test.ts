/**
 * Tests for entrypoint generation.
 */

import { describe, expect, it } from 'bun:test';

import { generateEntrypoint, hashEntrypoint } from './entrypoint';

describe('entrypoint', () => {
  describe('generateEntrypoint', () => {
    it('generates valid entrypoint code', () => {
      const code = generateEntrypoint({
        workflowsPath: '/path/to/workflows.ts',
        workflowInterceptorModules: [],
      });

      expect(code).toContain("require('@temporalio/workflow/lib/worker-interface.js')");
      expect(code).toContain("require('@temporalio/workflow/lib/global-overrides.js')");
      expect(code).toContain('overrideGlobals()');
      expect(code).toContain('exports.api');
      expect(code).toContain('exports.importWorkflows');
      expect(code).toContain('exports.importInterceptors');
    });

    it('includes workflows path in require', () => {
      const code = generateEntrypoint({
        workflowsPath: '/my/custom/workflows.ts',
        workflowInterceptorModules: [],
      });

      expect(code).toContain('"/my/custom/workflows.ts"');
    });

    it('includes interceptor modules', () => {
      const code = generateEntrypoint({
        workflowsPath: '/path/to/workflows.ts',
        workflowInterceptorModules: [
          '/path/to/interceptor1.ts',
          '/path/to/interceptor2.ts',
        ],
      });

      expect(code).toContain('"/path/to/interceptor1.ts"');
      expect(code).toContain('"/path/to/interceptor2.ts"');
    });

    it('deduplicates interceptor modules', () => {
      const code = generateEntrypoint({
        workflowsPath: '/path/to/workflows.ts',
        workflowInterceptorModules: [
          '/path/to/interceptor.ts',
          '/path/to/interceptor.ts',
          '/path/to/interceptor.ts',
        ],
      });

      // Should only appear once
      const matches = code.match(/\/path\/to\/interceptor\.ts/g);
      expect(matches).toHaveLength(1);
    });

    it('has correct structure', () => {
      const code = generateEntrypoint({
        workflowsPath: '/path/to/workflows.ts',
        workflowInterceptorModules: [],
      });

      // Check order: api first, then overrideGlobals, then exports
      const apiIndex = code.indexOf(
        "require('@temporalio/workflow/lib/worker-interface.js')",
      );
      const overrideIndex = code.indexOf('overrideGlobals()');
      const importWorkflowsIndex = code.indexOf('exports.importWorkflows');

      expect(apiIndex).toBeLessThan(overrideIndex);
      expect(overrideIndex).toBeLessThan(importWorkflowsIndex);
    });

    it('exports importWorkflows as a function', () => {
      const code = generateEntrypoint({
        workflowsPath: '/path/to/workflows.ts',
        workflowInterceptorModules: [],
      });

      expect(code).toContain('function importWorkflows()');
    });

    it('exports importInterceptors as a function', () => {
      const code = generateEntrypoint({
        workflowsPath: '/path/to/workflows.ts',
        workflowInterceptorModules: [],
      });

      expect(code).toContain('function importInterceptors()');
    });
  });

  describe('hashEntrypoint', () => {
    it('returns a hex string', () => {
      const hash = hashEntrypoint({
        workflowsPath: '/path/to/workflows.ts',
        workflowInterceptorModules: [],
      });

      expect(hash).toMatch(/^[a-f0-9]+$/);
    });

    it('returns consistent hash for same input', () => {
      const options = {
        workflowsPath: '/path/to/workflows.ts',
        workflowInterceptorModules: ['/interceptor.ts'],
      };

      const hash1 = hashEntrypoint(options);
      const hash2 = hashEntrypoint(options);

      expect(hash1).toBe(hash2);
    });

    it('returns different hash for different workflows path', () => {
      const hash1 = hashEntrypoint({
        workflowsPath: '/path/to/workflows1.ts',
        workflowInterceptorModules: [],
      });

      const hash2 = hashEntrypoint({
        workflowsPath: '/path/to/workflows2.ts',
        workflowInterceptorModules: [],
      });

      expect(hash1).not.toBe(hash2);
    });

    it('returns different hash for different interceptors', () => {
      const hash1 = hashEntrypoint({
        workflowsPath: '/path/to/workflows.ts',
        workflowInterceptorModules: ['/interceptor1.ts'],
      });

      const hash2 = hashEntrypoint({
        workflowsPath: '/path/to/workflows.ts',
        workflowInterceptorModules: ['/interceptor2.ts'],
      });

      expect(hash1).not.toBe(hash2);
    });

    it('returns 16 character hash', () => {
      const hash = hashEntrypoint({
        workflowsPath: '/path/to/workflows.ts',
        workflowInterceptorModules: [],
      });

      expect(hash).toHaveLength(16);
    });
  });

  describe('workflow name stabilization', () => {
    it('includes stabilizeWorkflowNames function', () => {
      const code = generateEntrypoint({
        workflowsPath: '/path/to/workflows.ts',
        workflowInterceptorModules: [],
      });

      expect(code).toContain('stabilizeWorkflowNames');
    });

    it('uses Object.defineProperty to set function names', () => {
      const code = generateEntrypoint({
        workflowsPath: '/path/to/workflows.ts',
        workflowInterceptorModules: [],
      });

      expect(code).toContain("Object.defineProperty(value, 'name'");
    });

    it('applies stabilization in importWorkflows', () => {
      const code = generateEntrypoint({
        workflowsPath: '/path/to/workflows.ts',
        workflowInterceptorModules: [],
      });

      expect(code).toContain('return stabilizeWorkflowNames(workflows)');
    });

    it('stabilization preserves non-function exports', () => {
      const code = generateEntrypoint({
        workflowsPath: '/path/to/workflows.ts',
        workflowInterceptorModules: [],
      });

      // The function should copy all exports, not just functions
      expect(code).toContain('stabilized[name] = value');
    });

    it('only modifies function.name property', () => {
      const code = generateEntrypoint({
        workflowsPath: '/path/to/workflows.ts',
        workflowInterceptorModules: [],
      });

      // Should check typeof === 'function' before modifying
      expect(code).toContain("typeof value === 'function'");
    });
  });
});
