# CI/CD Integration

CI-friendly output modes, GitHub Actions annotations, source map upload, and reproducible build verification.

## Quick Start

```bash
# Check bundle size in CI
bundle-temporal-workflow check ./src/workflows.ts --budget 500KB --ci

# Verify reproducible builds
bundle-temporal-workflow verify ./src/workflows.ts

# JSON output for machine consumption
bundle-temporal-workflow check ./src/workflows.ts --budget 500KB --json
```

## API Reference

### CI Reports

#### `generateCIReport(bundle, options?)`

Generate a structured CI-friendly report from a build result.

```typescript
function generateCIReport(
  bundle: WorkflowBundle,
  options?: { sizeAnalysis?: SizeAnalysisResult },
): CIReport;
```

#### `CIReport`

| Field         | Type      | Description                       |
| ------------- | --------- | --------------------------------- |
| `success`     | `boolean` | Overall build success             |
| `size`        | `number`  | Bundle size in bytes              |
| `gzipSize`    | `number`  | Estimated gzip size               |
| `moduleCount` | `number`  | Number of modules                 |
| `warnings`    | `array`   | Build warnings                    |
| `metadata`    | `object`  | Build metadata                    |
| `budget`      | `object`  | Budget check result (if provided) |

#### `formatCIReportText(report)`

Format a CI report as a text summary suitable for PR comments.

```typescript
import { generateCIReport, formatCIReportText } from 'build-temporal-workflow';

const report = generateCIReport(bundle, { sizeAnalysis: analysis });
console.log(formatCIReportText(report));
```

#### `formatGitHubAnnotations(report)`

Format a CI report as GitHub Actions annotation commands (`::warning`, `::error`).

```typescript
import { generateCIReport, formatGitHubAnnotations } from 'build-temporal-workflow';

const report = generateCIReport(bundle);

// Output GitHub Actions annotations
console.log(formatGitHubAnnotations(report));
// ::warning file=src/workflows.ts::Bundle size approaching budget (420KB / 500KB)
```

### Source Map Management

#### `remapSourceMapPaths(sourceMapJson, options)`

Rewrite paths in a source map for deployment environments.

```typescript
function remapSourceMapPaths(
  sourceMapJson: string,
  options: SourceMapRemapOptions,
): string;
```

```typescript
import { remapSourceMapPaths } from 'build-temporal-workflow';

const remapped = remapSourceMapPaths(bundle.sourceMap, {
  stripPrefix: '/Users/ci/project/',
  addPrefix: 'src/',
});
```

#### `remapSourceMapFile(sourceMapPath, options, outputPath?)`

Remap a source map file on disk. Writes to `outputPath` or overwrites the original.

#### `uploadSourceMap(bundle, options)`

Upload a source map to an external service for production debugging.

```typescript
function uploadSourceMap(
  bundle: { code: string; sourceMap: string },
  options: SourceMapUploadOptions,
): Promise<void>;
```

```typescript
import { uploadSourceMap } from 'build-temporal-workflow';

await uploadSourceMap(
  { code: bundle.code, sourceMap: bundle.sourceMap },
  {
    endpoint: 'https://sourcemaps.example.com/upload',
    apiKey: process.env.SOURCEMAP_API_KEY,
    release: process.env.GIT_SHA,
  },
);
```

#### `SourceMapUploadOptions`

| Field      | Type     | Description                        |
| ---------- | -------- | ---------------------------------- |
| `endpoint` | `string` | URL to upload source maps to       |
| `apiKey`   | `string` | Authentication key                 |
| `release`  | `string` | Release identifier (e.g., git SHA) |

### Determinism Verification

#### `verifyDeterministicBuild(options, buildCount?)`

Build the same workflow multiple times and compare outputs to verify reproducibility.

```typescript
function verifyDeterministicBuild(
  options: BundleOptions,
  buildCount?: number,
): Promise<DeterminismVerifyResult>;
```

```typescript
import { verifyDeterministicBuild } from 'build-temporal-workflow';

const result = await verifyDeterministicBuild(
  {
    workflowsPath: './src/workflows.ts',
    mode: 'production',
    sourceMap: 'none',
  },
  3, // Build 3 times
);

if (!result.deterministic) {
  console.error('Build is NOT reproducible!');
  for (const diff of result.differences) {
    console.error(`  ${diff}`);
  }
  process.exit(1);
}

console.log(`Build is reproducible (hash: ${result.referenceHash})`);
```

#### `DeterminismVerifyResult`

| Field           | Type       | Description                                  |
| --------------- | ---------- | -------------------------------------------- |
| `deterministic` | `boolean`  | Whether all builds produced identical output |
| `buildCount`    | `number`   | Number of builds performed                   |
| `referenceHash` | `string`   | Hash of the first build                      |
| `differences`   | `string[]` | Description of any differences found         |

## CLI Commands

### `check`

Build and validate against size budgets:

```bash
bundle-temporal-workflow check ./src/workflows.ts --budget 500KB
bundle-temporal-workflow check ./src/workflows.ts --budget 500KB --strict
bundle-temporal-workflow check ./src/workflows.ts --budget 500KB --ci
bundle-temporal-workflow check ./src/workflows.ts --budget 500KB --json
```

| Flag       | Description                        |
| ---------- | ---------------------------------- |
| `--budget` | Size budget (e.g., `500KB`, `1MB`) |
| `--strict` | Fail on warnings (not just errors) |
| `--ci`     | CI-friendly text output            |
| `--json`   | Machine-readable JSON output       |

### `verify`

Verify build determinism:

```bash
bundle-temporal-workflow verify ./src/workflows.ts
bundle-temporal-workflow verify ./src/workflows.ts --json
```

## Examples

### GitHub Actions workflow

```yaml
name: Temporal Bundle Check
on: [pull_request]

jobs:
  bundle-check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: oven-sh/setup-bun@v2

      - run: bun install

      - name: Check bundle size
        run: |
          bundle-temporal-workflow check ./src/workflows.ts \
            --budget 500KB --strict --ci

      - name: Verify reproducible builds
        run: |
          bundle-temporal-workflow verify ./src/workflows.ts

      - name: Build and upload source maps
        run: |
          bundle-temporal-workflow build ./src/workflows.ts \
            -o ./dist/workflow-bundle.js \
            --source-map external \
            --mode production
```

### Programmatic CI integration

```typescript
import {
  analyzeSize,
  bundleWorkflowCode,
  generateCIReport,
  formatGitHubAnnotations,
  verifyDeterministicBuild,
} from 'build-temporal-workflow';

// Build
const bundle = await bundleWorkflowCode({
  workflowsPath: './src/workflows.ts',
  mode: 'production',
  sourceMap: 'external',
});

// Analyze
const analysis = analyzeSize(bundle, { total: 512_000 });
const report = generateCIReport(bundle, { sizeAnalysis: analysis });

// Output GitHub annotations
if (process.env.GITHUB_ACTIONS) {
  console.log(formatGitHubAnnotations(report));
}

// Verify determinism
const verify = await verifyDeterministicBuild({
  workflowsPath: './src/workflows.ts',
  mode: 'production',
  sourceMap: 'none',
});

if (!verify.deterministic) {
  process.exit(1);
}
```

### Content hashing for cache keys

```typescript
import { computeBundleContentHash } from 'build-temporal-workflow';

// Compute a hash of all input files for CI cache keys
const hash = computeBundleContentHash('./src/workflows.ts', {
  includeNodeModules: false,
  extensions: ['.ts', '.tsx'],
});

console.log(`Cache key: workflow-bundle-${hash}`);
```

## Related

- [Bundle Analysis](./bundle-analysis.md) — Size budgets and comparison
- [Bundle Signing](./bundle-signing.md) — Sign bundles for deployment verification
- [Determinism Checking](./determinism-checking.md) — Detect non-deterministic code
