---
description: Fix all code quality issues in the codebase through iterative error resolution.
---

# Code Quality Fixing Task

Your mission is to fix ALL code quality issues in this codebase. This includes:

- **Linting errors** (ESLint warnings and errors)
- **TypeScript compilation errors**
- **Test failures**
- **Code formatting issues**
- **Type checking problems**

## Critical Instructions

- 🚨 **Do not stop** when you encounter errors. Finding errors is the _entire point_ of this command!
- 🔧 Your job is to _fix_ the errors, _not_ avoid them.
- 🔄 **Work iteratively.** Fix one issue, check again, fix the next issue.

## Approach

1. **Discover issues** by running diagnostic commands.
2. **Analyze each error** to understand the root cause.
3. **Fix the underlying problem.** (Do _not_ just suppress warnings).
4. **Verify the fix** by re-running checks.
5. **Continue until everything passes.**

## Tools Available

Run these commands to check for issues, but remember: When they fail, that's when your real work begins.

- bun test
- bun run lint:fix
- bun run typecheck
- bun run format

Start by checking what issues exist, then systematically fix them all.

Do _not_ modify any of the existing ESLint rules (e.g. `eslint.config.ts`), TypeScript configuration (e.g. `tsconfig.json`). Do _not_ trying to use inline comments to bypass rules.

1. It is _never_ acceptable to leave failing tests.
2. It is _never_ accceptable to leave typecheck errors.
3. It is _never_ acceptable to leave lint errors.

It doesn't matter if the error is related to your changes or not. I do _not_ want to hear that the issues were pre-existing.
