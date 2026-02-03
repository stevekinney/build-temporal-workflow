# Bundle Analysis

Analyze workflow bundle size, enforce size budgets, and compare bundles across builds.

## Quick Start

```typescript
import { analyzeSize, bundleWorkflowCode } from 'build-temporal-workflow';

const bundle = await bundleWorkflowCode({
  workflowsPath: './src/workflows.ts',
});

const analysis = analyzeSize(bundle, { total: 512_000 }); // 500KB budget

console.log(`Total: ${analysis.totalSize} bytes`);
console.log(`Gzip: ${analysis.gzipSize} bytes`);
console.log(`Modules: ${analysis.moduleCount}`);

if (analysis.budgetResult?.status === 'fail') {
  console.error(analysis.budgetResult.message);
}
```

## API Reference

### `analyzeSize(bundle, budget?)`

Analyze a workflow bundle's size, module breakdown, and optional budget compliance.

```typescript
function analyzeSize(
  bundle: WorkflowBundle,
  budget?: BundleSizeBudget,
): SizeAnalysisResult;
```

#### `BundleSizeBudget`

| Option      | Type     | Default | Description                               |
| ----------- | -------- | ------- | ----------------------------------------- |
| `total`     | `number` | —       | Maximum total bundle size in bytes        |
| `perModule` | `number` | —       | Maximum size per module in bytes          |
| `warn`      | `number` | `80`    | Warning threshold as percentage of budget |
| `fail`      | `number` | `100`   | Failure threshold as percentage of budget |

#### `SizeAnalysisResult`

| Field             | Type               | Description                              |
| ----------------- | ------------------ | ---------------------------------------- |
| `totalSize`       | `number`           | Total bundle size in bytes               |
| `gzipSize`        | `number`           | Estimated gzipped size in bytes          |
| `moduleCount`     | `number`           | Number of modules in the bundle          |
| `modules`         | `ModuleSizeInfo[]` | Per-module breakdown, sorted by size     |
| `topContributors` | `ModuleSizeInfo[]` | Largest modules                          |
| `budgetResult`    | `object`           | Budget check result (if budget provided) |

### `compareBundle(prev, current)`

Compare two workflow bundles to identify what changed.

```typescript
function compareBundle(prev: WorkflowBundle, current: WorkflowBundle): BundleComparison;
```

```typescript
import { compareBundle, formatComparison } from 'build-temporal-workflow';

const comparison = compareBundle(previousBundle, currentBundle);

console.log(formatComparison(comparison));
// Output:
//   Size: 340.2 KB → 352.8 KB (+12.6 KB, +3.7%)
//   Added: 2 modules
//   Removed: 0 modules
//   Changed: 5 modules
```

#### `BundleComparison`

| Field             | Type     | Description                         |
| ----------------- | -------- | ----------------------------------- |
| `previousSize`    | `number` | Previous bundle size in bytes       |
| `currentSize`     | `number` | Current bundle size in bytes        |
| `delta`           | `number` | Size difference (positive = larger) |
| `deltaPercentage` | `number` | Percentage change                   |
| `added`           | `array`  | Modules that were added             |
| `removed`         | `array`  | Modules that were removed           |
| `changed`         | `array`  | Modules that changed in size        |

### `formatBytes(bytes)`

Format a byte count as a human-readable string.

```typescript
formatBytes(1024); // "1.00 KB"
formatBytes(1_048_576); // "1.00 MB"
```

### `parseSize(sizeStr)`

Parse a human-readable size string to bytes.

```typescript
parseSize('500KB'); // 512000
parseSize('1MB'); // 1048576
parseSize('1.5MB'); // 1572864
```

## CLI

### `check` command

Build and validate against size budgets:

```bash
# Check against a 500KB budget
bundle-temporal-workflow check ./src/workflows.ts --budget 500KB

# Strict mode (fail on warnings too)
bundle-temporal-workflow check ./src/workflows.ts --budget 500KB --strict

# CI-friendly output
bundle-temporal-workflow check ./src/workflows.ts --budget 500KB --ci

# JSON output
bundle-temporal-workflow check ./src/workflows.ts --budget 500KB --json
```

### `analyze` command

Full bundle composition analysis:

```bash
bundle-temporal-workflow analyze ./src/workflows.ts
```

Output includes total size, module count, dependency list, top modules by size with bar chart, and forbidden module detection.

## Examples

### CI budget enforcement

```typescript
import { analyzeSize, bundleWorkflowCode } from 'build-temporal-workflow';

const bundle = await bundleWorkflowCode({
  workflowsPath: './src/workflows.ts',
  mode: 'production',
  sourceMap: 'none',
});

const analysis = analyzeSize(bundle, {
  total: 512_000,
  warn: 80,
  fail: 100,
});

if (analysis.budgetResult?.status === 'fail') {
  console.error(`Bundle exceeds budget: ${analysis.budgetResult.message}`);
  process.exit(1);
}

if (analysis.budgetResult?.status === 'warn') {
  console.warn(`Bundle approaching budget: ${analysis.budgetResult.message}`);
}
```

### Tracking size across builds

```typescript
import { compareBundle, formatComparison } from 'build-temporal-workflow';
import { readFileSync } from 'node:fs';

// Load previous bundle from artifact
const prev = { code: readFileSync('./baseline/bundle.js', 'utf-8') };

// Build current
const current = await bundleWorkflowCode({
  workflowsPath: './src/workflows.ts',
});

const diff = compareBundle(prev, current);
console.log(formatComparison(diff));

// Fail if size increased by more than 10%
if (diff.deltaPercentage > 10) {
  throw new Error(`Bundle size increased by ${diff.deltaPercentage.toFixed(1)}%`);
}
```

## Related

- [CI/CD Integration](./ci-cd-integration.md) — Automated budget checks in CI
- [Multi-Queue Builds](./multi-queue-builds.md) — Per-queue size analysis
