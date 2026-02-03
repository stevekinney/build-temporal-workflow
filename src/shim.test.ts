/**
 * Tests for the esbuild output shim.
 */

import { describe, expect, it } from 'bun:test';

import { shimEsbuildOutput, validateShimmedOutput } from './shim';

describe('shim', () => {
  describe('shimEsbuildOutput', () => {
    it('wraps esbuild output with IIFE', () => {
      const code = 'var x = 1; module.exports = { x };';
      const shimmed = shimEsbuildOutput(code);

      expect(shimmed).toContain('(function()');
      expect(shimmed).toContain('})();');
    });

    it('initializes shared module cache', () => {
      const code = 'module.exports = {};';
      const shimmed = shimEsbuildOutput(code);

      expect(shimmed).toContain('globalThis.__webpack_module_cache__');
      expect(shimmed).toContain(
        'globalThis.__webpack_module_cache__ = globalThis.__webpack_module_cache__ || {}',
      );
    });

    it('exposes exports as __TEMPORAL__', () => {
      const code = 'module.exports = { test: true };';
      const shimmed = shimEsbuildOutput(code);

      expect(shimmed).toContain('globalThis.__TEMPORAL__ = module.exports');
    });

    it('preserves original code', () => {
      const code =
        'const api = require("@temporalio/workflow"); module.exports = { api };';
      const shimmed = shimEsbuildOutput(code);

      expect(shimmed).toContain('@temporalio/workflow');
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
