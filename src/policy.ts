/**
 * Determinism policy engine for Temporal workflows.
 *
 * Loads forbidden/allowed module lists from the installed SDK when possible,
 * falling back to bundled defaults for SDK 1.14.x.
 */

import { builtinModules } from 'node:module';

import type { DeterminismPolicy } from './types';

/**
 * Node.js builtins that are allowed in workflows with Temporal stubs
 */
export const ALLOWED_BUILTINS = ['assert', 'url', 'util'] as const;

/**
 * Default forbidden modules for SDK 1.14.x
 */
export function getDefaultForbiddenModules(): string[] {
  // Compute disallowed builtins at runtime to match user's Node version
  const disallowedBuiltins = builtinModules.filter(
    (m) => !ALLOWED_BUILTINS.includes(m as (typeof ALLOWED_BUILTINS)[number]),
  );

  return [
    ...disallowedBuiltins,
    '@temporalio/activity',
    '@temporalio/client',
    '@temporalio/worker',
    '@temporalio/common/lib/internal-non-workflow',
    '@temporalio/interceptors-opentelemetry/lib/client',
    '@temporalio/interceptors-opentelemetry/lib/worker',
    '@temporalio/testing',
    '@temporalio/core-bridge',
  ];
}

/**
 * Load determinism policy from the installed Temporal SDK.
 *
 * Falls back to bundled defaults if the SDK exports are not available.
 */
export function loadDeterminismPolicy(): DeterminismPolicy {
  try {
    // Try to import policy from installed @temporalio/worker
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const bundlerModule = require('@temporalio/worker/lib/workflow/bundler') as {
      disallowedModules?: unknown;
      allowedBuiltinModules?: unknown;
    };
    const { disallowedModules, allowedBuiltinModules } = bundlerModule;

    if (
      Array.isArray(disallowedModules) &&
      Array.isArray(allowedBuiltinModules) &&
      disallowedModules.every((m): m is string => typeof m === 'string') &&
      allowedBuiltinModules.every((m): m is string => typeof m === 'string')
    ) {
      return {
        allowed: allowedBuiltinModules,
        forbidden: disallowedModules,
      };
    }
  } catch {
    // SDK doesn't export these, use defaults
  }

  return {
    allowed: [...ALLOWED_BUILTINS],
    forbidden: getDefaultForbiddenModules(),
  };
}

/**
 * Normalize a module specifier by stripping the 'node:' prefix if present.
 */
export function normalizeSpecifier(spec: string): string {
  return spec.startsWith('node:') ? spec.slice(5) : spec;
}

/**
 * Check if a module matches any in the given list.
 * Matches exact names and subpath imports (e.g., 'fs' matches 'fs/promises').
 */
export function moduleMatches(userModule: string, modules: string[]): boolean {
  const normalized = normalizeSpecifier(userModule);
  return modules.some((m) => normalized === m || normalized.startsWith(`${m}/`));
}

/**
 * Check if a module is an allowed builtin.
 */
export function isAllowedBuiltin(module: string): boolean {
  const normalized = normalizeSpecifier(module);
  return ALLOWED_BUILTINS.some(
    (allowed) => normalized === allowed || normalized.startsWith(`${allowed}/`),
  );
}

/**
 * Check if a module is forbidden according to the policy.
 */
export function isForbidden(module: string, policy: DeterminismPolicy): boolean {
  return moduleMatches(module, policy.forbidden);
}

/**
 * Pre-resolved module override paths.
 * These are resolved once at module load time to avoid repeated require.resolve() calls.
 */
const MODULE_OVERRIDE_PATHS = new Map<string, string>();

/**
 * Initialize module override paths at module load time.
 * This pre-resolves all known allowed builtin overrides.
 */
function initModuleOverridePaths(): void {
  for (const mod of ALLOWED_BUILTINS) {
    try {
      const path = require.resolve(
        `@temporalio/worker/lib/workflow/module-overrides/${mod}.js`,
      );
      MODULE_OVERRIDE_PATHS.set(mod, path);
    } catch {
      // Module override not available, will throw at runtime if requested
    }
  }
}

// Initialize paths when module loads
initModuleOverridePaths();

/**
 * Get the path to a module override stub from the installed Temporal SDK.
 *
 * @param moduleName - The builtin module name (e.g., 'assert', 'url', 'util')
 * @returns The resolved path to the stub module
 * @throws If the stub cannot be found
 */
export function getModuleOverridePath(moduleName: string): string {
  const normalized = normalizeSpecifier(moduleName);

  if (!ALLOWED_BUILTINS.includes(normalized as (typeof ALLOWED_BUILTINS)[number])) {
    throw new Error(`No module override available for '${moduleName}'`);
  }

  // Check pre-resolved cache first
  const cached = MODULE_OVERRIDE_PATHS.get(normalized);
  if (cached) {
    return cached;
  }

  // Fallback: resolve from installed @temporalio/worker package (shouldn't happen normally)
  try {
    const path = require.resolve(
      `@temporalio/worker/lib/workflow/module-overrides/${normalized}.js`,
    );
    MODULE_OVERRIDE_PATHS.set(normalized, path);
    return path;
  } catch {
    throw new Error(
      `Could not find Temporal module override for '${moduleName}'. ` +
        'Ensure @temporalio/worker is installed and is version 1.14.0 or later.',
    );
  }
}
