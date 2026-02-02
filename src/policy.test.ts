/**
 * Tests for the determinism policy engine.
 */

import { describe, expect, it } from 'bun:test';

import {
  ALLOWED_BUILTINS,
  getDefaultForbiddenModules,
  getModuleOverridePath,
  isAllowedBuiltin,
  isForbidden,
  loadDeterminismPolicy,
  moduleMatches,
  normalizeSpecifier,
} from './policy';

describe('policy', () => {
  describe('normalizeSpecifier', () => {
    it('strips node: prefix', () => {
      expect(normalizeSpecifier('node:fs')).toBe('fs');
      expect(normalizeSpecifier('node:path')).toBe('path');
      expect(normalizeSpecifier('node:assert')).toBe('assert');
    });

    it('returns unchanged if no prefix', () => {
      expect(normalizeSpecifier('fs')).toBe('fs');
      expect(normalizeSpecifier('path')).toBe('path');
      expect(normalizeSpecifier('@temporalio/workflow')).toBe('@temporalio/workflow');
    });
  });

  describe('moduleMatches', () => {
    it('matches exact module names', () => {
      expect(moduleMatches('fs', ['fs', 'path'])).toBe(true);
      expect(moduleMatches('path', ['fs', 'path'])).toBe(true);
    });

    it('matches subpath imports', () => {
      expect(moduleMatches('fs/promises', ['fs'])).toBe(true);
      expect(
        moduleMatches('@temporalio/worker/lib/bundler', ['@temporalio/worker']),
      ).toBe(true);
    });

    it('returns false for non-matches', () => {
      expect(moduleMatches('net', ['fs', 'path'])).toBe(false);
      expect(moduleMatches('filesystem', ['fs'])).toBe(false);
    });

    it('handles node: prefix', () => {
      expect(moduleMatches('node:fs', ['fs'])).toBe(true);
      expect(moduleMatches('node:fs/promises', ['fs'])).toBe(true);
    });
  });

  describe('ALLOWED_BUILTINS', () => {
    it('contains assert, url, util', () => {
      expect(ALLOWED_BUILTINS).toContain('assert');
      expect(ALLOWED_BUILTINS).toContain('url');
      expect(ALLOWED_BUILTINS).toContain('util');
    });

    it('has exactly 3 entries', () => {
      expect(ALLOWED_BUILTINS).toHaveLength(3);
    });
  });

  describe('isAllowedBuiltin', () => {
    it('returns true for allowed builtins', () => {
      expect(isAllowedBuiltin('assert')).toBe(true);
      expect(isAllowedBuiltin('url')).toBe(true);
      expect(isAllowedBuiltin('util')).toBe(true);
    });

    it('returns true for node: prefixed allowed builtins', () => {
      expect(isAllowedBuiltin('node:assert')).toBe(true);
      expect(isAllowedBuiltin('node:url')).toBe(true);
      expect(isAllowedBuiltin('node:util')).toBe(true);
    });

    it('returns false for forbidden builtins', () => {
      expect(isAllowedBuiltin('fs')).toBe(false);
      expect(isAllowedBuiltin('path')).toBe(false);
      expect(isAllowedBuiltin('crypto')).toBe(false);
    });
  });

  describe('getDefaultForbiddenModules', () => {
    const forbidden = getDefaultForbiddenModules();

    it('includes common forbidden builtins', () => {
      expect(forbidden).toContain('fs');
      expect(forbidden).toContain('path');
      expect(forbidden).toContain('crypto');
      expect(forbidden).toContain('net');
      expect(forbidden).toContain('http');
      expect(forbidden).toContain('child_process');
    });

    it('excludes allowed builtins', () => {
      expect(forbidden).not.toContain('assert');
      expect(forbidden).not.toContain('url');
      expect(forbidden).not.toContain('util');
    });

    it('includes forbidden Temporal packages', () => {
      expect(forbidden).toContain('@temporalio/activity');
      expect(forbidden).toContain('@temporalio/client');
      expect(forbidden).toContain('@temporalio/worker');
      expect(forbidden).toContain('@temporalio/testing');
      expect(forbidden).toContain('@temporalio/core-bridge');
    });

    it('includes internal non-workflow modules', () => {
      expect(forbidden).toContain('@temporalio/common/lib/internal-non-workflow');
    });

    it('includes OpenTelemetry client/worker modules', () => {
      expect(forbidden).toContain('@temporalio/interceptors-opentelemetry/lib/client');
      expect(forbidden).toContain('@temporalio/interceptors-opentelemetry/lib/worker');
    });
  });

  describe('loadDeterminismPolicy', () => {
    it('returns a policy object', () => {
      const policy = loadDeterminismPolicy();
      expect(policy).toHaveProperty('allowed');
      expect(policy).toHaveProperty('forbidden');
    });

    it('policy.allowed contains assert, url, util', () => {
      const policy = loadDeterminismPolicy();
      expect(policy.allowed).toContain('assert');
      expect(policy.allowed).toContain('url');
      expect(policy.allowed).toContain('util');
    });

    it('policy.forbidden contains fs', () => {
      const policy = loadDeterminismPolicy();
      expect(policy.forbidden).toContain('fs');
    });
  });

  describe('isForbidden', () => {
    const policy = loadDeterminismPolicy();

    it('returns true for forbidden modules', () => {
      expect(isForbidden('fs', policy)).toBe(true);
      expect(isForbidden('path', policy)).toBe(true);
      expect(isForbidden('@temporalio/worker', policy)).toBe(true);
    });

    it('returns false for allowed modules', () => {
      expect(isForbidden('assert', policy)).toBe(false);
      expect(isForbidden('url', policy)).toBe(false);
      expect(isForbidden('util', policy)).toBe(false);
    });

    it('handles node: prefix', () => {
      expect(isForbidden('node:fs', policy)).toBe(true);
      expect(isForbidden('node:assert', policy)).toBe(false);
    });

    it('matches subpaths', () => {
      expect(isForbidden('fs/promises', policy)).toBe(true);
      expect(isForbidden('@temporalio/worker/lib/bundler', policy)).toBe(true);
    });
  });

  describe('getModuleOverridePath', () => {
    it('returns path for allowed builtins', () => {
      const assertPath = getModuleOverridePath('assert');
      expect(assertPath).toContain('module-overrides');
      expect(assertPath).toContain('assert');
    });

    it('handles node: prefix', () => {
      const urlPath = getModuleOverridePath('node:url');
      expect(urlPath).toContain('module-overrides');
      expect(urlPath).toContain('url');
    });

    it('throws for non-allowed modules', () => {
      expect(() => getModuleOverridePath('fs')).toThrow();
      expect(() => getModuleOverridePath('crypto')).toThrow();
    });
  });
});
