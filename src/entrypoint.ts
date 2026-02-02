/**
 * Synthetic entrypoint generator for Temporal workflow bundles.
 *
 * Creates the entrypoint that:
 * 1. Loads the Temporal workflow API
 * 2. Calls overrideGlobals() for determinism
 * 3. Exports importWorkflows() and importInterceptors() functions
 */

import { createHash } from 'node:crypto';

export interface EntrypointOptions {
  /**
   * Path to the user's workflow module
   */
  workflowsPath: string;

  /**
   * Paths to interceptor modules
   */
  workflowInterceptorModules: string[];

  /**
   * Path to custom payload converter module
   */
  payloadConverterPath?: string | undefined;

  /**
   * Path to custom failure converter module
   */
  failureConverterPath?: string | undefined;
}

/**
 * Generate the synthetic entrypoint code for the workflow bundle.
 *
 * The entrypoint:
 * - Loads @temporalio/workflow/lib/worker-interface.js
 * - Calls overrideGlobals() to install deterministic replacements
 * - Exports api, importWorkflows(), and importInterceptors()
 * - Stabilizes workflow function names to survive minification
 *
 * User code is NOT executed at bundle time - only when Worker calls the import functions.
 */
export function generateEntrypoint(options: EntrypointOptions): string {
  const { workflowsPath, workflowInterceptorModules } = options;

  // Deduplicate interceptor modules while preserving order
  const uniqueInterceptors = [...new Set(workflowInterceptorModules)];

  const interceptorImports = uniqueInterceptors
    .map((m) => `require(${JSON.stringify(m)})`)
    .join(',\n    ');

  // The stabilizeWorkflowNames function ensures that workflow function names
  // are preserved even after minification. It works by:
  // 1. Iterating over all exports from the workflows module
  // 2. For each function export, setting fn.name to the export key
  // 3. This ensures the Temporal SDK can correctly identify workflow types
  //
  // This is critical because Temporal uses function.name to determine the
  // workflow type, and minifiers can mangle these names.

  return `// Auto-generated entrypoint for Temporal workflow bundle
const api = require('@temporalio/workflow/lib/worker-interface.js');
exports.api = api;

const { overrideGlobals } = require('@temporalio/workflow/lib/global-overrides.js');
overrideGlobals();

/**
 * Stabilize workflow function names to survive minification.
 * Sets fn.name from the export key for all function exports.
 */
function stabilizeWorkflowNames(workflows) {
  const stabilized = {};
  for (const [name, value] of Object.entries(workflows)) {
    if (typeof value === 'function') {
      // Define the name property to match the export key
      // This ensures workflow type names survive minification
      Object.defineProperty(value, 'name', {
        value: name,
        writable: false,
        configurable: true,
      });
    }
    stabilized[name] = value;
  }
  return stabilized;
}

exports.importWorkflows = function importWorkflows() {
  const workflows = require(${JSON.stringify(workflowsPath)});
  return stabilizeWorkflowNames(workflows);
};

exports.importInterceptors = function importInterceptors() {
  return [
    ${interceptorImports}
  ];
};
`;
}

/**
 * Generate a hash of the entrypoint content for cache invalidation.
 */
export function hashEntrypoint(options: EntrypointOptions): string {
  const content = JSON.stringify({
    workflowsPath: options.workflowsPath,
    workflowInterceptorModules: options.workflowInterceptorModules,
    payloadConverterPath: options.payloadConverterPath,
    failureConverterPath: options.failureConverterPath,
  });

  return createHash('sha256').update(content).digest('hex').slice(0, 16);
}
