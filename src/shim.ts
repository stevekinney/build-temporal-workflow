/**
 * esbuild output shim for Temporal workflow bundles.
 *
 * esbuild produces CJS output with its own module cache. We apply a minimal
 * transformation to:
 * 1. Redirect the module cache to globalThis.__webpack_module_cache__
 * 2. Expose the bundle exports as globalThis.__TEMPORAL__
 */

/**
 * Apply the shim to esbuild output.
 *
 * The shim:
 * - Wraps the bundle in an IIFE
 * - Initializes the shared global module cache
 * - Exposes exports as globalThis.__TEMPORAL__
 *
 * @param code - The raw esbuild output
 * @returns The shimmed bundle code
 */
export function shimEsbuildOutput(code: string): string {
  const { bundleCode, sourceMapDirective } = extractTrailingSourceMapDirective(code);

  const shimmedCode = `(function() {
  // Initialize shared module cache for v8 isolate reuse
  globalThis.__webpack_module_cache__ = globalThis.__webpack_module_cache__ || {};

  // Create a fake module object to capture exports
  var module = { exports: {} };
  var exports = module.exports;

  // Original esbuild output
  ${bundleCode}

  // Expose as __TEMPORAL__ for Worker consumption
  globalThis.__TEMPORAL__ = module.exports;
})();
`;

  // Temporal parses inline source maps from `base64,` to EOF, so keep the
  // source map directive as the final non-whitespace content.
  if (sourceMapDirective) {
    return `${shimmedCode}${sourceMapDirective}\n`;
  }

  return shimmedCode;
}

const TRAILING_SOURCE_MAP_DIRECTIVE =
  /(?:\r?\n|^)(\/\/# sourceMappingURL=[^\r\n]+|\/\*# sourceMappingURL=[\s\S]*?\*\/)\s*$/;

function extractTrailingSourceMapDirective(code: string): {
  bundleCode: string;
  sourceMapDirective: string | undefined;
} {
  const match = code.match(TRAILING_SOURCE_MAP_DIRECTIVE);
  if (!match?.[1]) {
    return {
      bundleCode: code,
      sourceMapDirective: undefined,
    };
  }

  return {
    bundleCode: code.slice(0, match.index),
    sourceMapDirective: match[1],
  };
}

/**
 * Validate that the shimmed output has the expected structure.
 */
export function validateShimmedOutput(code: string): { valid: boolean; error?: string } {
  // Check for __webpack_module_cache__ reference
  if (!code.includes('__webpack_module_cache__')) {
    return {
      valid: false,
      error: 'Missing __webpack_module_cache__ reference',
    };
  }

  // Check for __TEMPORAL__ assignment
  if (!code.includes('__TEMPORAL__')) {
    return {
      valid: false,
      error: 'Missing __TEMPORAL__ global assignment',
    };
  }

  return { valid: true };
}
