# build-temporal-workflow

A faster alternative to Temporal's `bundleWorkflowCode` that uses esbuild instead of Webpack. Bundles Temporal workflow code **5-8x faster** with significantly lower memory usage.

## Why Use This?

The Temporal TypeScript SDK uses Webpack to bundle workflow code. This works fine, but Webpack is slow—especially in development and test environments where you're bundling frequently.

This package replaces the Webpack bundler with esbuild, providing:

- **5-8x faster builds** — From ~150-180ms down to ~20-30ms
- **75-90% less memory** — From 8-13MB down to 1-3MB peak heap usage
- **Watch mode** — Rebuild automatically on file changes with esbuild's incremental builds
- **Better error messages** — Dependency chain analysis shows exactly how a forbidden module got imported
- **Static analysis** — Detect non-deterministic patterns before they cause replay failures
- **Bundle caching** — In-memory caching dramatically speeds up test suites
- **Cross-runtime support** — Bundle Deno or Bun-flavored TypeScript

## Installation

```bash
npm install build-temporal-workflow
# or
bun add build-temporal-workflow
```

## Quick Start

Replace Temporal's `bundleWorkflowCode` with this package's version:

```typescript
// Before
import { bundleWorkflowCode } from '@temporalio/worker';

// After
import { bundleWorkflowCode } from 'build-temporal-workflow';
```

The API is compatible, so in most cases you can swap the import and everything just works:

```typescript
import { Worker } from '@temporalio/worker';
import { bundleWorkflowCode } from 'build-temporal-workflow';

const bundle = await bundleWorkflowCode({
  workflowsPath: require.resolve('./workflows'),
});

const worker = await Worker.create({
  workflowBundle: bundle,
  taskQueue: 'my-task-queue',
  // ...
});
```

## Performance Benchmarks

Measured on Apple M1 Max with Bun 1.3.2:

| Fixture              |    esbuild |      Webpack |  Speedup |
| -------------------- | ---------: | -----------: | -------: |
| Small (~5 modules)   | 24ms ± 3ms | 179ms ± 20ms | **7.5x** |
| Medium (~20 modules) | 30ms ± 5ms |  160ms ± 7ms | **5.3x** |
| Large (~50+ modules) | 31ms ± 7ms |  174ms ± 1ms | **5.7x** |
| Heavy dependencies   | 24ms ± 4ms | 155ms ± 13ms | **6.6x** |

Memory usage comparison (peak heap):

| Fixture    | esbuild | Webpack |   Savings |
| ---------- | ------: | ------: | --------: |
| Small      |  1.9 MB |  7.3 MB |  75% less |
| Medium     |   ~0 MB | 13.3 MB | 100% less |
| Large      |  1.8 MB | 12.6 MB |  86% less |
| Heavy deps |  2.8 MB | 11.1 MB |  75% less |

Run benchmarks yourself:

```bash
# Quick benchmark (small fixture only)
bun run benchmark:quick

# Full benchmark suite
bun run benchmark:full

# Custom options
bun run benchmark -r 10 -w 3 -o markdown --file BENCHMARK.md
```

## Advantages Over Temporal's Bundler

### 1. Faster Builds

esbuild is written in Go and compiles code orders of magnitude faster than Webpack. This matters most in:

- **Development** — Faster iteration cycles
- **Testing** — Test suites that bundle workflows run much faster
- **CI/CD** — Faster builds mean faster deployments

### 2. Better Error Messages

When a forbidden module is imported (like `fs` or `http`), this bundler shows the complete dependency chain:

```
Error: Forbidden module 'fs' found in workflow bundle

Dependency chain:
  workflows.ts
    → utils/file-helper.ts
      → node_modules/some-lib/index.js
        → fs (forbidden)

Hint: Move file operations to Activities, which run outside the workflow sandbox.
```

### 3. Watch Mode

Automatically rebuild when source files change:

```bash
bundle-temporal-workflow build ./src/workflows.ts -o ./dist/bundle.js --watch
```

Or programmatically:

```typescript
import { watchWorkflowCode } from 'build-temporal-workflow';

const handle = await watchWorkflowCode(
  { workflowsPath: './src/workflows' },
  (bundle, error) => {
    if (error) {
      console.error('Build failed:', error);
    } else {
      console.log('Rebuilt!', bundle.code.length, 'bytes');
      // Hot-reload worker...
    }
  },
);

// Later, stop watching
await handle.stop();
```

### 4. Bundle Caching

Cache bundles in memory for dramatically faster test suites:

```typescript
import { getCachedBundle } from 'build-temporal-workflow';

// First call builds the bundle (~25ms)
const bundle = await getCachedBundle({
  workflowsPath: require.resolve('./workflows'),
});

// Subsequent calls return cached bundle (~0ms)
const sameBundleAgain = await getCachedBundle({
  workflowsPath: require.resolve('./workflows'),
});
```

Cache is automatically invalidated when workflow files change.

### 5. Pre-built Bundle Loading

Build bundles in CI and load them at runtime without rebuilding:

```typescript
import { loadBundle } from 'build-temporal-workflow';

const { bundle, warnings } = loadBundle({
  path: './dist/workflow-bundle.js',
  expectedSdkVersion: '1.14.0',
});

if (warnings?.length) {
  console.warn('Bundle warnings:', warnings);
}

const worker = await Worker.create({
  workflowBundle: bundle,
  taskQueue: 'my-queue',
});
```

### 6. Replay Safety Analysis

Detect non-deterministic patterns that will break workflow replay:

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

Detects patterns like:

- `Date.now()` — Use `workflow.currentTime()` instead
- `Math.random()` — Use `workflow.random()` instead
- `setTimeout`/`setInterval` — Use `workflow.sleep()` instead
- `fetch`/`axios` — Move to Activities
- `crypto.randomBytes()` — Use `workflow.uuid4()` or move to Activities

### 7. Cross-Runtime Support

Bundle workflows written for Deno or Bun:

```typescript
const bundle = await bundleWorkflowCode({
  workflowsPath: './src/workflows.ts',
  inputFlavor: 'deno', // or 'bun' or 'auto'
  denoConfigPath: './deno.json', // For import maps
});
```

Supports:

- Deno's `npm:` specifiers
- URL imports (with caching)
- Import maps
- Bun's `bun:` builtins

### 8. Workflow Manifests

Generate manifests for debugging and validation:

```typescript
import { generateManifest, compareManifests } from 'build-temporal-workflow';

const manifest = generateManifest({
  workflowsPath: './src/workflows',
  bundleCode: bundle.code,
});

console.log(manifest.workflows);
// [{ name: 'orderWorkflow', sourceHash: 'abc123', line: 42 }, ...]

// Compare manifests to detect changes
const diff = compareManifests(oldManifest, newManifest);
console.log(diff.added); // New workflows
console.log(diff.removed); // Deleted workflows
console.log(diff.changed); // Modified workflows
```

## API Reference

### bundleWorkflowCode(options)

Bundle workflow code for use with Temporal Worker.

```typescript
import { bundleWorkflowCode } from 'build-temporal-workflow';

const bundle = await bundleWorkflowCode({
  // Required: Path to workflows file or directory
  workflowsPath: './src/workflows.ts',

  // Optional: Build mode (default: 'development')
  mode: 'production',

  // Optional: Source map mode (default: 'inline')
  sourceMap: 'inline' | 'external' | 'none',

  // Optional: Modules to exclude from bundle
  ignoreModules: ['some-node-only-lib'],

  // Optional: Workflow interceptor modules
  workflowInterceptorModules: ['./src/interceptors.ts'],

  // Optional: Custom payload converter
  payloadConverterPath: './src/payload-converter.ts',

  // Optional: Custom failure converter
  failureConverterPath: './src/failure-converter.ts',

  // Optional: Logger for build output
  logger: createConsoleLogger(),

  // Optional: Include metadata in bundle (default: true)
  report: true,

  // Optional: Input flavor for cross-runtime support
  inputFlavor: 'node' | 'deno' | 'bun' | 'auto',

  // Optional: Additional esbuild options
  buildOptions: {
    define: { 'process.env.DEBUG': 'true' },
  },
});
```

Returns:

```typescript
interface WorkflowBundle {
  code: string; // Bundled JavaScript code
  sourceMap?: string; // Source map (if external)
  metadata?: {
    createdAt: string;
    mode: 'development' | 'production';
    entryHash: string;
    bundlerVersion: string;
    temporalSdkVersion: string;
    warnings?: string[];
  };
}
```

### watchWorkflowCode(options, callback)

Watch for changes and rebuild automatically.

```typescript
import { watchWorkflowCode } from 'build-temporal-workflow';

const handle = await watchWorkflowCode(
  { workflowsPath: './src/workflows' },
  (bundle, error) => {
    if (error) {
      console.error('Build failed:', error);
    } else {
      // bundle is the new WorkflowBundle
    }
  },
);

// Stop watching
await handle.stop();
```

### getCachedBundle(options)

Get a bundle, using cache when possible.

```typescript
import { getCachedBundle, clearBundleCache } from 'build-temporal-workflow';

const bundle = await getCachedBundle({
  workflowsPath: './src/workflows',
  forceRebuild: false, // Set true to bypass cache
});

// Clear all cached bundles
clearBundleCache();
```

### loadBundle(options)

Load a pre-built bundle from disk.

```typescript
import { loadBundle } from 'build-temporal-workflow';

const { bundle, warnings, path } = loadBundle({
  path: './dist/workflow-bundle.js',
  sourceMapPath: './dist/workflow-bundle.js.map', // Optional
  validate: true, // Validate structure (default: true)
  expectedSdkVersion: '1.14.0', // Warn if different
});
```

### analyzeReplaySafety(options)

Detect non-deterministic patterns in workflow code.

```typescript
import { analyzeReplaySafety, formatReplayViolations } from 'build-temporal-workflow';

const result = await analyzeReplaySafety({
  workflowsPath: './src/workflows',

  // Optional: Ignore specific patterns
  ignorePatterns: ['Math.random'], // Allow Math.random

  // Optional: Ignore specific files
  ignoreFiles: ['**/*.test.ts'],

  // Optional: Custom patterns to check
  additionalPatterns: [
    {
      pattern: /\beval\s*\(/g,
      name: 'eval()',
      reason: 'eval() is non-deterministic',
      suggestion: 'Avoid eval in workflows',
      severity: 'error',
    },
  ],
});

// Format for display
console.log(formatReplayViolations(result.violations));
```

### generateManifest(options)

Generate a manifest of workflow exports.

```typescript
import { generateManifest, compareManifests } from 'build-temporal-workflow';

const manifest = generateManifest({
  workflowsPath: './src/workflows',
  bundleCode: bundle.code,
  includeSourceHashes: true,
});

// Compare two manifests
const diff = compareManifests(oldManifest, newManifest);
```

### validateBundle(bundle, options)

Validate a bundle is properly structured.

```typescript
import { validateBundle, validateBundleStructure } from 'build-temporal-workflow';

// Quick structure check
const structureResult = validateBundleStructure(bundle.code);
if (!structureResult.valid) {
  throw new Error(structureResult.error);
}

// Full validation with version check
const result = validateBundle(bundle, {
  workerVersion: '1.14.0',
});
```

## CLI

The package includes a CLI for building and analyzing bundles.

### build

Bundle workflow code:

```bash
# Write to file
bundle-temporal-workflow build ./src/workflows.ts -o ./dist/bundle.js

# With options
bundle-temporal-workflow build ./src/workflows.ts \
  -o ./dist/bundle.js \
  --mode production \
  --source-map external \
  --ignore lodash \
  --verbose

# Watch mode
bundle-temporal-workflow build ./src/workflows.ts -o ./dist/bundle.js --watch

# Output as JSON
bundle-temporal-workflow build ./src/workflows.ts --json
```

### analyze

Analyze bundle composition:

```bash
bundle-temporal-workflow analyze ./src/workflows.ts

# Output:
# Bundle Analysis
#
# Summary
#   Total size: 336.18 KB
#   Module count: 58
#
# Dependencies (4)
#   • @temporalio/common
#   • @temporalio/workflow
#   • long
#   • ms
#
# Largest Modules
#   ████████████████████ 49.80 KB (14.8%) long/umd/index.js
#   ██████████████░░░░░░ 35.20 KB (10.5%) @temporalio/workflow/...
#   ...
#
# ✓ No forbidden modules found
```

### doctor

Check environment and configuration:

```bash
bundle-temporal-workflow doctor

# Output:
# ✓ Bundler Version: bundle-temporal-workflow v0.0.1
# ✓ Temporal SDK: @temporalio/workflow v1.14.1
# ✓ Temporal Worker: @temporalio/worker is installed
# ✓ Module Overrides: Temporal module stubs are available
# ✓ esbuild: esbuild v0.27.2
# ✓ Node.js: Node.js v24.3.0
# ✓ Bun Runtime: Bun v1.3.2
#
# All checks passed
```

## Configuration

### BundleOptions

| Option                       | Type                                  | Default         | Description                         |
| ---------------------------- | ------------------------------------- | --------------- | ----------------------------------- |
| `workflowsPath`              | `string`                              | _required_      | Path to workflows file or directory |
| `mode`                       | `'development' \| 'production'`       | `'development'` | Build mode                          |
| `sourceMap`                  | `'inline' \| 'external' \| 'none'`    | `'inline'`      | Source map mode                     |
| `ignoreModules`              | `string[]`                            | `[]`            | Modules to exclude from bundle      |
| `workflowInterceptorModules` | `string[]`                            | `[]`            | Interceptor module paths            |
| `payloadConverterPath`       | `string`                              | -               | Custom payload converter            |
| `failureConverterPath`       | `string`                              | -               | Custom failure converter            |
| `logger`                     | `Logger`                              | -               | Logger for build output             |
| `report`                     | `boolean`                             | `true`          | Include metadata in bundle          |
| `inputFlavor`                | `'node' \| 'deno' \| 'bun' \| 'auto'` | `'auto'`        | Input flavor                        |
| `denoConfigPath`             | `string`                              | -               | Path to deno.json                   |
| `importMapPath`              | `string`                              | -               | Path to import map                  |
| `buildOptions`               | `esbuild.BuildOptions`                | -               | Additional esbuild options          |
| `plugins`                    | `BundlerPlugin[]`                     | `[]`            | Bundler plugins                     |

### Enforced esbuild Options

These options are enforced and cannot be overridden to preserve workflow type inference and determinism:

| Option        | Value   | Reason                               |
| ------------- | ------- | ------------------------------------ |
| `bundle`      | `true`  | Required for workflow isolation      |
| `format`      | `'cjs'` | Temporal's sandbox requires CommonJS |
| `minify`      | `false` | Preserves workflow function names    |
| `treeShaking` | `false` | Preserves workflow exports           |
| `splitting`   | `false` | Not supported in workflow sandbox    |
| `keepNames`   | `true`  | Required for workflow type inference |

## Troubleshooting

### "Forbidden module 'X' found in workflow bundle"

Workflow code runs in a sandbox without access to Node.js APIs. If you're importing a module that uses Node APIs:

1. **Move to Activities** — Network calls, file I/O, and other side effects should be in Activities, not Workflows
2. **Use `ignoreModules`** — If a module is only used for types or is tree-shaken away, add it to `ignoreModules`
3. **Check the dependency chain** — The error message shows how the forbidden module was imported

### "Dynamic import found"

Dynamic `import()` is not allowed in workflows because the module resolved at runtime may differ between original execution and replay. Replace with static imports or move the logic to Activities.

### Bundle validation fails

If `validateBundleStructure` fails, check that:

1. The bundle was built with this package
2. The bundle wasn't corrupted during write
3. The bundle contains the required `__TEMPORAL__` global

## Contributing

```bash
# Install dependencies
bun install

# Run tests
bun test

# Run linter
bun run lint

# Run type checker
bun run typecheck

# Run benchmarks
bun run benchmark
```

## License

MIT
