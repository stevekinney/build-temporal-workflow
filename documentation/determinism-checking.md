# Determinism Checking

Detect non-deterministic code patterns in workflows, map violations to original source locations, get Temporal-safe alternatives, and analyze history growth risks.

## Quick Start

```typescript
import { analyzeReplaySafety } from 'build-temporal-workflow';

const result = await analyzeReplaySafety({
  workflowsPath: './src/workflows',
});

for (const violation of result.violations) {
  console.warn(`${violation.file}:${violation.line} - ${violation.pattern}`);
  console.warn(`  ${violation.reason}`);
  console.warn(`  Fix: ${violation.suggestion}`);
}
```

## API Reference

### Replay Safety Analysis

#### `analyzeReplaySafety(options)`

Detect non-deterministic patterns in workflow code.

```typescript
function analyzeReplaySafety(
  options: AnalyzeReplaySafetyOptions,
): Promise<ReplaySafetyResult>;
```

| Option               | Type                    | Description                     |
| -------------------- | ----------------------- | ------------------------------- |
| `workflowsPath`      | `string`                | Path to workflow source files   |
| `ignorePatterns`     | `string[]`              | Pattern names to ignore         |
| `ignoreFiles`        | `string[]`              | Glob patterns for files to skip |
| `additionalPatterns` | `ReplayUnsafePattern[]` | Custom patterns to check        |

Built-in patterns detected:

| Pattern              | Replacement                      |
| -------------------- | -------------------------------- |
| `Date.now()`         | `workflow.currentTime()`         |
| `new Date()`         | `workflow.currentTime()`         |
| `Math.random()`      | `workflow.random()`              |
| `setTimeout`         | `workflow.sleep()`               |
| `setInterval`        | `workflow.sleep()` in a loop     |
| `fetch` / `axios`    | Move to Activities               |
| `crypto.randomBytes` | `workflow.uuid4()` or Activities |

#### `analyzeFileReplaySafety(filePath, patterns)`

Analyze a single file against a pattern list.

#### `formatReplayViolations(violations)`

Format violations for human-readable display.

#### `REPLAY_UNSAFE_PATTERNS`

The built-in array of `ReplayUnsafePattern` objects used by `analyzeReplaySafety`.

### Violation Source Mapping

#### `mapViolationsToSource(violations, sourceMapJson)`

Map determinism violations from bundled code back to original source locations using source maps.

```typescript
function mapViolationsToSource(
  violations: ReplayViolation[],
  sourceMapJson: string,
): MappedViolation[];
```

```typescript
import {
  analyzeReplaySafety,
  mapViolationsToSource,
  formatMappedViolations,
} from 'build-temporal-workflow';

const result = await analyzeReplaySafety({
  workflowsPath: './src/workflows',
});

// If you have a source map from the bundle
const mapped = mapViolationsToSource(result.violations, bundle.sourceMap);
console.log(formatMappedViolations(mapped));
```

#### `MappedViolation`

| Field            | Type     | Description                         |
| ---------------- | -------- | ----------------------------------- |
| `originalFile`   | `string` | Original source file path           |
| `originalLine`   | `number` | Line number in original source      |
| `originalColumn` | `number` | Column number in original source    |
| `pattern`        | `string` | The non-deterministic pattern found |
| `reason`         | `string` | Why this pattern is problematic     |
| `suggestion`     | `string` | Recommended fix                     |

### Forbidden API Alternatives

#### `FORBIDDEN_ALTERNATIVES`

A record mapping forbidden API names to their Temporal-safe alternatives with usage examples.

```typescript
import { FORBIDDEN_ALTERNATIVES, getAlternative } from 'build-temporal-workflow';

const alt = getAlternative('Date.now()');
if (alt) {
  console.log(alt.replacement); // "workflow.currentTime()"
  console.log(alt.example); // Usage example
}

// List all alternatives
import { listAlternatives } from 'build-temporal-workflow';
console.log(listAlternatives());
```

#### `getAlternative(pattern)`

Look up the Temporal-safe alternative for a forbidden API.

#### `formatAlternative(alt)`

Format an alternative as a human-readable error message.

#### `listAlternatives()`

Get all forbidden-to-safe mappings as a formatted list.

### History Growth Analysis

#### `analyzeHistorySize(code, filePath?)`

Detect workflow patterns that could cause unbounded history growth.

```typescript
function analyzeHistorySize(code: string, filePath?: string): HistoryAnalysisResult;
```

```typescript
import { analyzeHistorySize } from 'build-temporal-workflow';

const source = readFileSync('./src/workflows/long-running.ts', 'utf-8');
const result = analyzeHistorySize(source, 'long-running.ts');

for (const warning of result.warnings) {
  console.warn(`[${warning.severity}] ${warning.message}`);
  console.warn(`  ${warning.suggestion}`);
}
```

#### `analyzeFileHistorySize(filePath)`

Convenience function that reads the file and analyzes it.

#### `HistoryWarning`

| Field        | Type     | Description                            |
| ------------ | -------- | -------------------------------------- |
| `severity`   | `string` | `'warning'` or `'error'`               |
| `message`    | `string` | Description of the history growth risk |
| `line`       | `number` | Line number in source                  |
| `suggestion` | `string` | How to fix the issue                   |

Patterns detected include:

- Infinite loops without `continueAsNew`
- Excessive signal handler registration
- Unbounded activity invocations in loops
- Missing `continueAsNew` in long-running workflows

## Examples

### Custom determinism patterns

```typescript
import { analyzeReplaySafety } from 'build-temporal-workflow';

const result = await analyzeReplaySafety({
  workflowsPath: './src/workflows',
  additionalPatterns: [
    {
      pattern: /\beval\s*\(/g,
      name: 'eval()',
      reason: 'eval() executes arbitrary code and is non-deterministic',
      suggestion: 'Avoid eval in workflows entirely',
      severity: 'error',
    },
    {
      pattern: /\bprocess\.env\b/g,
      name: 'process.env',
      reason: 'Environment variables may differ between original execution and replay',
      suggestion: 'Pass configuration as workflow arguments',
      severity: 'warning',
    },
  ],
});
```

### Ignoring known-safe patterns

```typescript
const result = await analyzeReplaySafety({
  workflowsPath: './src/workflows',
  ignorePatterns: ['Math.random'], // You have a seeded random wrapper
  ignoreFiles: ['**/*.test.ts', '**/test-helpers/**'],
});
```

## Related

- [Workflow Validation](./workflow-validation.md) — Validate workflow exports and boundaries
- [CI/CD Integration](./ci-cd-integration.md) — Run determinism checks in CI
- [Testing](./testing.md) — Relaxed determinism for test bundles
