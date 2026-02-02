/**
 * Workflow-centric error classes with actionable messages
 */

import type { WorkflowBundleErrorCode, WorkflowBundleErrorContext } from './types';

/**
 * Error thrown when workflow bundling fails.
 *
 * Contains structured error information including:
 * - Error code for programmatic handling
 * - Detailed message with context
 * - Actionable hint for fixing the issue
 * - Optional dependency chain showing how the problem was reached
 */
export class WorkflowBundleError extends Error {
  /**
   * Error code for programmatic handling
   */
  readonly code: WorkflowBundleErrorCode;

  /**
   * Additional context about the error
   */
  readonly context: WorkflowBundleErrorContext;

  constructor(code: WorkflowBundleErrorCode, context: WorkflowBundleErrorContext = {}) {
    const message = formatErrorMessage(code, context);
    super(message);
    this.name = 'WorkflowBundleError';
    this.code = code;
    this.context = context;

    // Maintain proper prototype chain
    Object.setPrototypeOf(this, WorkflowBundleError.prototype);
  }
}

function formatErrorMessage(
  code: WorkflowBundleErrorCode,
  context: WorkflowBundleErrorContext,
): string {
  const parts: string[] = [];

  switch (code) {
    case 'FORBIDDEN_MODULES':
      parts.push(
        'Your Workflow code (or a library used by your Workflow code) is importing disallowed modules:',
      );
      if (context.modules) {
        parts.push(context.modules.map((m) => `  - '${m}'`).join('\n'));
      }
      if (context.details) {
        parts.push('', context.details);
      }
      parts.push(
        '',
        "These modules can't be used in workflow context as they might break determinism.",
      );
      break;

    case 'DYNAMIC_IMPORT':
      parts.push(
        'Dynamic imports are not supported in workflow code.',
        '',
        'Workflow code must have static imports so that all dependencies can be bundled.',
      );
      if (context.details) {
        parts.push('', context.details);
      }
      break;

    case 'RESOLUTION_FAILED':
      parts.push('Failed to resolve module import.');
      if (context.modules && context.modules.length > 0) {
        parts.push(`  Module: '${context.modules[0]}'`);
      }
      if (context.details) {
        parts.push('', context.details);
      }
      break;

    case 'IGNORED_MODULE_USED':
      parts.push('A module that was marked as ignored was executed at runtime.');
      if (context.modules && context.modules.length > 0) {
        parts.push(`  Module: '${context.modules[0]}'`);
      }
      parts.push('', 'This indicates the module is actually used in workflow code.');
      break;

    case 'CONFIG_INVALID':
      parts.push('Invalid bundler configuration:');
      if (context.violations) {
        parts.push(context.violations.map((v) => `  - ${v}`).join('\n'));
      }
      break;

    case 'BUILD_FAILED':
      parts.push('Bundle build failed.');
      if (context.details) {
        parts.push('', context.details);
      }
      break;

    case 'ENTRYPOINT_NOT_FOUND':
      parts.push('Workflow entrypoint not found.');
      if (context.details) {
        parts.push('', context.details);
      }
      break;
  }

  // Add dependency chain if available
  if (context.dependencyChain && context.dependencyChain.length > 0) {
    parts.push('', 'Dependency chain:');
    parts.push(
      context.dependencyChain
        .map((dep, i) => `  ${' '.repeat(i * 2)}→ ${dep}`)
        .join('\n'),
    );
  }

  // Add hint if available
  if (context.hint) {
    parts.push('', `HINT: ${context.hint}`);
  } else {
    // Default hints based on error code
    const defaultHint = getDefaultHint(code);
    if (defaultHint) {
      parts.push('', `HINT: ${defaultHint}`);
    }
  }

  return parts.join('\n');
}

function getDefaultHint(code: WorkflowBundleErrorCode): string | undefined {
  switch (code) {
    case 'FORBIDDEN_MODULES':
      return (
        'Consider the following options:\n' +
        ' • Make sure that activity code is not imported from workflow code. Use `import type` to import activity function signatures.\n' +
        ' • Move code that has non-deterministic behaviour to activities.\n' +
        " • If you know for sure that a disallowed module will not be used at runtime, add its name to 'ignoreModules'.\n" +
        'See also: https://docs.temporal.io/typescript/determinism'
      );

    case 'DYNAMIC_IMPORT':
      return 'Replace dynamic imports (import() or require with variables) with static imports.';

    case 'RESOLUTION_FAILED':
      return 'Check that the module is installed and the import path is correct.';

    case 'IGNORED_MODULE_USED':
      return "Move this usage to an Activity or remove it from 'ignoreModules'.";

    case 'CONFIG_INVALID':
      return 'Review the bundler configuration and fix the listed violations.';

    case 'BUILD_FAILED':
      return 'Check the error details above for more information.';

    case 'ENTRYPOINT_NOT_FOUND':
      return 'Verify that workflowsPath points to a valid file or directory.';

    default:
      return undefined;
  }
}
