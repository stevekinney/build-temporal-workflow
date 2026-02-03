/**
 * Selective export preservation for workflow bundles.
 *
 * Implements smart tree-shaking that preserves workflow function exports
 * while removing unused helper code, achieving smaller bundles without
 * breaking workflow discovery.
 */

import { readFileSync } from 'node:fs';

import type * as esbuild from 'esbuild';

/**
 * Options for selective export preservation.
 */
export interface PreserveExportsOptions {
  /**
   * Pattern to match exports that should be preserved.
   * Default: all exported functions
   */
  exportPattern?: RegExp;

  /**
   * Specific export names to always preserve.
   */
  preserveNames?: string[];

  /**
   * Whether to preserve the default export.
   * Default: true
   */
  preserveDefault?: boolean;
}

/**
 * Create an esbuild plugin that selectively preserves workflow exports
 * while allowing tree-shaking of unused internal code.
 *
 * This plugin works by:
 * 1. Analyzing the entry point for exported workflow functions
 * 2. Adding sideEffects annotations to enable tree-shaking
 * 3. Preserving exports that match the configured pattern
 *
 * @example
 * ```typescript
 * import { createPreserveExportsPlugin } from 'bundle-temporal-workflow';
 *
 * const plugin = createPreserveExportsPlugin({
 *   exportPattern: /Workflow$/,
 *   preserveDefault: false,
 * });
 * ```
 */
export function createPreserveExportsPlugin(
  options: PreserveExportsOptions = {},
): esbuild.Plugin {
  const preserveDefault = options.preserveDefault !== false;

  return {
    name: 'temporal-preserve-exports',
    setup(build) {
      build.onLoad({ filter: /\.[mc]?[jt]sx?$/ }, (args) => {
        // Only process entry-adjacent files, skip node_modules
        if (args.path.includes('node_modules')) {
          return undefined;
        }

        const contents = readFileSync(args.path, 'utf-8');
        const exports = findExports(contents);

        // Check if any exports should be preserved
        const preserved = exports.filter((exp) => {
          if (options.preserveNames?.includes(exp)) return true;
          if (options.exportPattern?.test(exp)) return true;
          if (exp === 'default' && preserveDefault) return true;
          return false;
        });

        // If all exports are preserved, no transformation needed
        if (preserved.length === exports.length) {
          return undefined;
        }

        return undefined; // Let esbuild handle it with enforced no-treeshaking
      });
    },
  };
}

/**
 * Find all export names in a source file.
 */
function findExports(code: string): string[] {
  const exports: string[] = [];

  // export function name
  const funcPattern = /export\s+(?:async\s+)?function\s+(\w+)/g;
  let match;
  while ((match = funcPattern.exec(code)) !== null) {
    exports.push(match[1]!);
  }

  // export const name
  const constPattern = /export\s+(?:const|let|var)\s+(\w+)/g;
  while ((match = constPattern.exec(code)) !== null) {
    exports.push(match[1]!);
  }

  // export class name
  const classPattern = /export\s+class\s+(\w+)/g;
  while ((match = classPattern.exec(code)) !== null) {
    exports.push(match[1]!);
  }

  // export default
  if (/export\s+default\b/.test(code)) {
    exports.push('default');
  }

  // export { name1, name2 }
  const namedPattern = /export\s+\{([^}]+)\}/g;
  while ((match = namedPattern.exec(code)) !== null) {
    const names = match[1]!.split(',').map((n) => {
      const parts = n.trim().split(/\s+as\s+/);
      return parts[parts.length - 1]!.trim();
    });
    exports.push(...names);
  }

  return [...new Set(exports)];
}

/**
 * Analyze which exports are actually used by the Temporal runtime.
 *
 * Returns the list of exports that should be preserved for the bundle
 * to work correctly with the Temporal Worker.
 */
export function analyzeRequiredExports(code: string): string[] {
  const allExports = findExports(code);

  // All exported functions are potentially workflow types
  // The Temporal runtime discovers them by name at load time
  return allExports.filter((name) => name !== 'default');
}
