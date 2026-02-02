/**
 * Tests for the esbuild output shim.
 */

import { describe, expect, it } from 'bun:test';

import { generateBundleHash, shimEsbuildOutput, validateShimmedOutput } from './shim';

describe('shim', () => {
  describe('shimEsbuildOutput', () => {
    it('wraps esbuild output with IIFE', () => {
      const code = 'var x = 1; module.exports = { x };';
      const shimmed = shimEsbuildOutput(code, 'abc123');

      expect(shimmed).toContain('(function()');
      expect(shimmed).toContain('})();');
    });

    it('initializes shared module cache', () => {
      const code = 'module.exports = {};';
      const shimmed = shimEsbuildOutput(code, 'abc123');

      expect(shimmed).toContain('globalThis.__webpack_module_cache__');
      expect(shimmed).toContain(
        'globalThis.__webpack_module_cache__ = globalThis.__webpack_module_cache__ || {}',
      );
    });

    it('exposes exports as __TEMPORAL__', () => {
      const code = 'module.exports = { test: true };';
      const shimmed = shimEsbuildOutput(code, 'abc123');

      expect(shimmed).toContain('globalThis.__TEMPORAL__ = module.exports');
    });

    it('includes bundle hash', () => {
      const code = 'module.exports = {};';
      const shimmed = shimEsbuildOutput(code, 'myhash123');

      expect(shimmed).toContain('"myhash123"');
    });

    it('preserves original code', () => {
      const code =
        'const api = require("@temporalio/workflow"); module.exports = { api };';
      const shimmed = shimEsbuildOutput(code, 'abc');

      expect(shimmed).toContain('@temporalio/workflow');
    });
  });

  describe('generateBundleHash', () => {
    it('returns a hex string', () => {
      const hash = generateBundleHash('some entrypoint content');
      expect(hash).toMatch(/^[a-f0-9]+$/);
    });

    it('returns 8 character hash', () => {
      const hash = generateBundleHash('content');
      expect(hash).toHaveLength(8);
    });

    it('returns consistent hash for same input', () => {
      const content = 'the same content';
      const hash1 = generateBundleHash(content);
      const hash2 = generateBundleHash(content);
      expect(hash1).toBe(hash2);
    });

    it('returns different hash for different input', () => {
      const hash1 = generateBundleHash('content 1');
      const hash2 = generateBundleHash('content 2');
      expect(hash1).not.toBe(hash2);
    });
  });

  describe('validateShimmedOutput', () => {
    it('returns valid for correct output', () => {
      const code = `
        globalThis.__webpack_module_cache__ = {};
        globalThis.__TEMPORAL__ = { api: {} };
      `;
      const result = validateShimmedOutput(code);
      expect(result.valid).toBe(true);
      expect(result.error).toBeUndefined();
    });

    it('returns invalid if missing __webpack_module_cache__', () => {
      const code = 'globalThis.__TEMPORAL__ = {};';
      const result = validateShimmedOutput(code);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('__webpack_module_cache__');
    });

    it('returns invalid if missing __TEMPORAL__', () => {
      const code = 'globalThis.__webpack_module_cache__ = {};';
      const result = validateShimmedOutput(code);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('__TEMPORAL__');
    });
  });
});
