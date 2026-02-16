/**
 * Tests for the esbuild output shim.
 */

import { describe, expect, it } from 'bun:test';

import { shimEsbuildOutput, validateShimmedOutput } from './shim';

function parseInlineSourceMapLikeTemporal(code: string): unknown {
  const marker = 'base64,';
  const markerIndex = code.indexOf(marker);
  if (markerIndex === -1) {
    throw new Error('Missing inline source map');
  }

  const encoded = code.slice(markerIndex + marker.length).trim();
  const decoded = Buffer.from(encoded, 'base64').toString('utf8');
  return JSON.parse(decoded);
}

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

    it('keeps inline source map directive as final non-whitespace content', () => {
      const mapBase64 = 'eyJ2ZXJzaW9uIjozfQ';
      const code = `module.exports = { test: true };
//# sourceMappingURL=data:application/json;base64,${mapBase64}
`;

      const shimmed = shimEsbuildOutput(code);
      const trimmed = shimmed.trimEnd();
      const directive = `//# sourceMappingURL=data:application/json;base64,${mapBase64}`;

      expect(trimmed.endsWith(directive)).toBe(true);
      expect(() => parseInlineSourceMapLikeTemporal(shimmed)).not.toThrow();
      expect(parseInlineSourceMapLikeTemporal(shimmed)).toEqual({ version: 3 });
    });

    it('demonstrates Temporal-style parse failure when code trails inline source map', () => {
      const broken = `module.exports = {};
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozfQ
globalThis.__TEMPORAL__ = module.exports;`;

      expect(() => parseInlineSourceMapLikeTemporal(broken)).toThrow();
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
