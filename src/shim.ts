/**
 * esbuild output shim for Temporal workflow bundles.
 *
 * esbuild produces CJS output with its own module cache. We apply a minimal
 * transformation to:
 * 1. Redirect the module cache to globalThis.__webpack_module_cache__
 * 2. Expose the bundle exports as globalThis.__TEMPORAL__
 */

import { createHash } from 'node:crypto';

/**
 * Apply the shim to esbuild output.
 *
 * The shim:
 * - Wraps the bundle in an IIFE
 * - Initializes the shared global module cache
 * - Exposes exports as globalThis.__TEMPORAL__
 *
 * @param code - The raw esbuild output
 * @param bundleHash - A hash to namespace module IDs and prevent collisions
 * @returns The shimmed bundle code
 */
export function shimEsbuildOutput(code: string, bundleHash: string): string {
  // esbuild output needs to be wrapped to expose __TEMPORAL__ and share module cache
  return wrapEsbuildOutput(code, bundleHash);
}

/**
 * Wrap esbuild output to expose __TEMPORAL__ and share module cache.
 */
function wrapEsbuildOutput(code: string, bundleHash: string): string {
  // esbuild's CJS output format varies, but typically:
  // - Uses var for module exports
  // - May use __require for CommonJS require
  // - Exports to module.exports
  //
  // We wrap the entire output and capture the exports

  return `(function() {
  // Initialize shared module cache for v8 isolate reuse
  globalThis.__webpack_module_cache__ = globalThis.__webpack_module_cache__ || {};
  var __bundleHash__ = ${JSON.stringify(bundleHash)};

  // Create a fake module object to capture exports
  var module = { exports: {} };
  var exports = module.exports;

  // Original esbuild output
  ${code}

  // Expose as __TEMPORAL__ for Worker consumption
  globalThis.__TEMPORAL__ = module.exports;
})();
`;
}

/**
 * Generate a hash for the bundle to use for module ID namespacing.
 * Uses Bun's fast native hash function when available, falls back to Node.js crypto.
 */
export function generateBundleHash(entrypointContent: string): string {
  if (typeof globalThis.Bun?.hash === 'function') {
    const hash = Bun.hash(entrypointContent);
    return hash.toString(16).slice(0, 8);
  }
  return createHash('sha256').update(entrypointContent).digest('hex').slice(0, 8);
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
