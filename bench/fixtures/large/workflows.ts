/**
 * Large fixture: ~50+ modules, stress test.
 *
 * This represents a complex production workflow codebase with:
 * - 15+ workflow files organized by domain
 * - 30+ utility modules
 * - Complex type hierarchies
 * - Multiple feature domains (user, order, product, notification, reporting)
 */

// Re-export all workflows
export * from './workflows/index';
