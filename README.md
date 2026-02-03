# build-temporal-workflow

[![MIT License](https://img.shields.io/badge/license-MIT-blue.svg)](./LICENSE)

A drop-in replacement for `@temporalio/worker`'s `bundleWorkflowCode` that swaps Webpack for esbuild (or Bun.build). Same API, same output, 9-11x faster builds, 94% less memory. Includes multi-queue orchestration, bundle size analysis, determinism checking with source-mapped violations, workflow export validation, Ed25519 bundle signing, CI/CD integration, and a plugin system.

## Documentation

- [Multi-Queue Builds](./documentation/multi-queue-builds.md)—Bundle multiple task queues, activity bundling, coordinated watch
- [Bundle Analysis](./documentation/bundle-analysis.md)—Size budgets, import cost analysis, build comparison
- [Determinism Checking](./documentation/determinism-checking.md)—Violation source mapping, alternatives, history analysis
- [Workflow Validation](./documentation/workflow-validation.md)—Export validation, activity types, package boundaries
- [CI/CD Integration](./documentation/ci-cd-integration.md)—CI output, source map upload, determinism verification
- [Plugin System](./documentation/plugin-system.md)—Plugin composition, priority, export preservation
- [TypeScript Integration](./documentation/typescript-integration.md)—Type checking, declaration generation, path alias resolution
- [Bundle Signing](./documentation/bundle-signing.md)—Ed25519 signing, key generation, verification
- [Testing](./documentation/testing.md)—Test bundle mode, mocks, relaxed determinism
- [SDK Compatibility](./documentation/sdk-compatibility.md)—Version matrix, instrumentation

## Why This Library Exists

The `bundleWorkflowCode` function in `@temporalio/worker` does two things:

1. it resolves your workflow code's dependency graph, and
2. it concatenates everything into a single CJS file that can run inside Temporal's V8 isolate.

That's it. There's no code splitting, no asset pipeline, no HMR, no loader ecosystem to support. It's a straightforward bundling job.

[Webpack](https://webpack.js.org/) is an super-capable tool, but its generality is a liability here. It parses its own configuration schema, initializes a plugin system, builds a module graph through its own resolution algorithm, and runs multiple optimization passes—all for a bundle that _must not be minified_ and _must not be tree-shaken_ as both break workflow determinism.

[esbuild](https://esbuild.github.io/) does the same job _way faster_ because it was designed from the ground up for speed: single-pass architecture, Go's compile-time optimizations, and zero configuration overhead. This library wraps esbuild with the same plugin hooks that Temporal needs—forbidden module detection, determinism policy enforcement, module stub injection—and produces output that is structurally identical to what Webpack generates.

The practical impact shows up in three places:

1. **Test suites**: If your tests create Workers (and they should—integration tests catch real bugs), each test pays the bundling cost. A suite with 20 Worker-creating tests goes from ~10s of bundling overhead to ~1s with esbuild, or ~0.6s with Bun.build. Add the in-memory cache and the second through twentieth tests pay ~0ms.
2. **Development iteration**: Watch mode with esbuild's incremental rebuild is nearly instant. Webpack's watch mode works but carries the same per-build overhead.
3. **CI pipelines**: Faster bundling means faster deployments. The memory savings also matter in constrained CI environments where you're running multiple jobs on shared runners.

This library is a drop-in replacement. Same function signature, same output shape, same `WorkflowBundle` type. Swap the import and your Workers keep working.

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

## Features

### Better Error Messages

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

### Watch Mode

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

### Bundle Caching

Cache bundles in memory for dramatically faster test suites:

```typescript
import { getCachedBundle } from 'build-temporal-workflow';

// First call builds the bundle (~50ms)
const bundle = await getCachedBundle({
  workflowsPath: require.resolve('./workflows'),
});

// Subsequent calls return cached bundle (~0ms)
const sameBundleAgain = await getCachedBundle({
  workflowsPath: require.resolve('./workflows'),
});
```

Cache is automatically invalidated when workflow files change.

### Pre-built Bundle Loading

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

### Replay Safety Analysis

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

- `Date.now()`—Use `workflow.currentTime()` instead
- `Math.random()`—Use `workflow.random()` instead
- `setTimeout`/`setInterval`—Use `workflow.sleep()` instead
- `fetch`/`axios`—Move to Activities
- `crypto.randomBytes()`—Use `workflow.uuid4()` or move to Activities

### Cross-Runtime Support

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

### TypeScript Path Aliases

Use TypeScript path aliases like `@/utils` in your workflow code:

```typescript
// tsconfig.json
{
  "compilerOptions": {
    "baseUrl": ".",
    "paths": {
      "@/*": ["./src/*"],
      "@utils/*": ["./src/utils/*"]
    }
  }
}
```

```typescript
// In your workflow code
import { helper } from '@/utils/helper';
import { format } from '@utils/format';
```

Enable path alias resolution by setting `tsconfigPath`:

```typescript
const bundle = await bundleWorkflowCode({
  workflowsPath: './src/workflows.ts',
  tsconfigPath: true, // Auto-detect tsconfig.json
});

// Or specify a path explicitly
const bundle = await bundleWorkflowCode({
  workflowsPath: './src/workflows.ts',
  tsconfigPath: './tsconfig.json',
});
```

This works with both the esbuild and Bun.build backends.

### Static File Imports

Import Markdown, TOML, YAML, and text files directly in your workflow code using opt-in plugins. Files are read and embedded at build time:

```typescript
import { bundleWorkflowCode } from 'build-temporal-workflow';
import { textLoader, tomlLoader, yamlLoader } from 'build-temporal-workflow/plugins';

const bundle = await bundleWorkflowCode({
  workflowsPath: './src/workflows.ts',
  buildOptions: {
    plugins: [textLoader(), tomlLoader(), yamlLoader()],
  },
});
```

Then in your workflow code:

```typescript
import readme from './README.md'; // string
import config from './config.toml'; // parsed object
import data from './data.yaml'; // parsed object
import notes from './notes.txt'; // string
```

| Plugin           | Default Extensions | Import Result                   |
| ---------------- | ------------------ | ------------------------------- |
| `textLoader`     | `.txt`, `.md`      | String (file contents)          |
| `markdownLoader` | `.md`              | String (file contents)          |
| `tomlLoader`     | `.toml`            | Parsed object (via `smol-toml`) |
| `yamlLoader`     | `.yaml`, `.yml`    | Parsed object (via `yaml`)      |

Each plugin can be imported individually or all at once:

```typescript
// Individual imports
import { textLoader } from 'build-temporal-workflow/plugins/text';
import { markdownLoader } from 'build-temporal-workflow/plugins/markdown';
import { tomlLoader } from 'build-temporal-workflow/plugins/toml';
import { yamlLoader } from 'build-temporal-workflow/plugins/yaml';

// Or import all from the plugins module
import { textLoader, tomlLoader, yamlLoader } from 'build-temporal-workflow/plugins';
```

Custom extensions are supported:

```typescript
// Handle additional extensions
textLoader({ extensions: ['.txt', '.md', '.text', '.ascii'] });
yamlLoader({ extensions: ['.yaml', '.yml', '.eyaml'] });
```

For TypeScript support, add the type declarations to your `tsconfig.json`:

```json
{
  "compilerOptions": {
    "types": ["build-temporal-workflow/types"]
  }
}
```

Or use a triple-slash directive:

```typescript
/// <reference types="build-temporal-workflow/types" />
```

### Workflow Manifests

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

## Performance

Measured on Apple M1 Max, Node v24.3.0, Bun 1.3.2. The `@temporalio/worker` column is the baseline (Webpack). All times are mean with 95% confidence intervals. 10 runs, 3 warmup, outliers filtered.

### Build Time

| Fixture              | @temporalio/worker |       esbuild (Node) |      Bun.build (Bun) |
| -------------------- | -----------------: | -------------------: | -------------------: |
| Small (~5 modules)   |       543ms ± 41ms |  59ms ± 7ms (**9x**) | 29ms ± 5ms (**19x**) |
| Medium (~20 modules) |       499ms ± 12ms | 49ms ± 8ms (**10x**) | 25ms ± 5ms (**20x**) |
| Large (~50+ modules) |       537ms ± 31ms |  57ms ± 8ms (**9x**) | 30ms ± 4ms (**18x**) |
| Heavy dependencies   |      630ms ± 105ms | 55ms ± 5ms (**11x**) | 32ms ± 2ms (**20x**) |

### Memory Usage (Peak Heap)

| Fixture              | @temporalio/worker | esbuild (Node) |      Savings |
| -------------------- | -----------------: | -------------: | -----------: |
| Small (~5 modules)   |           52.25 MB |        3.03 MB | **94% less** |
| Medium (~20 modules) |           51.71 MB |        3.08 MB | **94% less** |
| Large (~50+ modules) |           54.02 MB |        3.49 MB | **94% less** |
| Heavy dependencies   |           52.04 MB |        2.82 MB | **95% less** |

To use the Bun bundler backend:

```typescript
const bundle = await bundleWorkflowCode({
  workflowsPath: './src/workflows.ts',
  bundler: 'bun', // explicitly use Bun.build
});
```

Run benchmarks yourself:

```bash
# Quick benchmark (small fixture only)
bun run benchmark:quick

# Full benchmark suite (10 runs, 3 warmup)
bun run benchmark:full

# Custom options
bun run benchmark -r 15 -w 5 -o markdown --file BENCHMARK.md

# Disable outlier filtering
bun run benchmark --no-filter-outliers

# Compare esbuild vs Bun.build (requires Bun runtime)
bun run benchmark:bun
```

The benchmark suite includes statistical analysis with 95% confidence intervals, outlier detection ([IQR method](https://en.wikipedia.org/wiki/Interquartile_range)), and significance testing ([Welch's t-test](https://en.wikipedia.org/wiki/Welch%27s_t-test)).

## Build Tool Integration

### Vite Plugin

Import workflow bundles directly in your Vite application using a query parameter:

```typescript
// vite.config.ts
import { temporalWorkflow } from 'build-temporal-workflow/vite';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [temporalWorkflow()],
});
```

Then import workflows with the `?workflow` query parameter:

```typescript
// src/worker.ts
import { Worker } from '@temporalio/worker';
import bundle from './workflows?workflow';

const worker = await Worker.create({
  workflowBundle: bundle,
  taskQueue: 'my-queue',
});
```

The plugin also supports import attributes:

```typescript
import bundle from './workflows' with { type: 'workflow' };
```

#### Vite Plugin Options

```typescript
temporalWorkflow({
  // Custom query parameter (default: 'workflow')
  identifier: 'temporal',

  // Pass options to bundleWorkflowCode
  bundleOptions: {
    sourceMap: 'external',
    ignoreModules: ['some-lib'],
  },
});
```

In development mode, the plugin caches bundles and automatically rebuilds when workflow files change.

### Bun Plugin

Import workflow bundles directly when using Bun:

```typescript
// Register as a runtime plugin (e.g., in a preload script)
import { temporalWorkflow } from 'build-temporal-workflow/bun';

Bun.plugin(temporalWorkflow());
```

Then import workflows with the `?workflow` query parameter:

```typescript
// src/worker.ts
import { Worker } from '@temporalio/worker';
import bundle from './workflows?workflow';

const worker = await Worker.create({
  workflowBundle: bundle,
  taskQueue: 'my-queue',
});
```

The plugin also works with `Bun.build`:

```typescript
import { temporalWorkflow } from 'build-temporal-workflow/bun';

await Bun.build({
  entrypoints: ['./src/worker.ts'],
  outdir: './dist',
  plugins: [temporalWorkflow()],
});
```

#### Bun Plugin Options

```typescript
temporalWorkflow({
  // Custom query parameter (default: 'workflow')
  identifier: 'temporal',

  // Pass options to bundleWorkflowCode
  bundleOptions: {
    sourceMap: 'external',
    ignoreModules: ['some-lib'],
    buildOptions: {
      plugins: [yamlLoader()], // Add file loader plugins
    },
  },
});
```

The plugin caches bundles by path to avoid redundant builds.

## API Reference

### Primary APIs

| Function                               | Description                                        |
| -------------------------------------- | -------------------------------------------------- |
| `bundleWorkflowCode(options)`          | Bundle workflow code for use with Temporal Worker  |
| `watchWorkflowCode(options, callback)` | Watch for changes and rebuild automatically        |
| `getCachedBundle(options)`             | Get a bundle, using in-memory cache when possible  |
| `loadBundle(options)`                  | Load a pre-built bundle from disk                  |
| `analyzeReplaySafety(options)`         | Detect non-deterministic patterns in workflow code |
| `validateBundle(bundle, options)`      | Validate a bundle's structure and version          |
| `generateManifest(options)`            | Generate a manifest of workflow exports            |
| `WorkflowCodeBundler`                  | Class-based API with build contexts and watch mode |
| `createConsoleLogger()`                | Create a console-based logger for development      |

### Multi-Queue & Activity Bundling

| Function                           | Description                               | Docs                                                        |
| ---------------------------------- | ----------------------------------------- | ----------------------------------------------------------- |
| `bundleMultipleWorkflows(options)` | Bundle workflows for multiple task queues | [Multi-Queue Builds](./documentation/multi-queue-builds.md) |
| `bundleActivityCode(options)`      | Bundle activity implementations           | [Multi-Queue Builds](./documentation/multi-queue-builds.md) |
| `watchTemporalCode(options)`       | Coordinated watch across queues           | [Multi-Queue Builds](./documentation/multi-queue-builds.md) |

### Analysis & Validation

| Function                                       | Description                          | Docs                                                            |
| ---------------------------------------------- | ------------------------------------ | --------------------------------------------------------------- |
| `analyzeSize(bundle, budget?)`                 | Bundle size analysis with budgets    | [Bundle Analysis](./documentation/bundle-analysis.md)           |
| `compareBundle(prev, current)`                 | Compare two bundles for changes      | [Bundle Analysis](./documentation/bundle-analysis.md)           |
| `mapViolationsToSource(violations, sourceMap)` | Map violations to original source    | [Determinism Checking](./documentation/determinism-checking.md) |
| `analyzeHistorySize(code)`                     | Detect unbounded history growth      | [Determinism Checking](./documentation/determinism-checking.md) |
| `validateWorkflowExports(path)`                | Validate workflow function exports   | [Workflow Validation](./documentation/workflow-validation.md)   |
| `validateActivityTypes(path)`                  | Validate activity type serialization | [Workflow Validation](./documentation/workflow-validation.md)   |
| `checkWorkflowBoundaries(path)`                | Enforce package boundaries           | [Workflow Validation](./documentation/workflow-validation.md)   |

### CI/CD & Signing

| Function                            | Description                | Docs                                                      |
| ----------------------------------- | -------------------------- | --------------------------------------------------------- |
| `generateCIReport(bundle)`          | CI-friendly build report   | [CI/CD Integration](./documentation/ci-cd-integration.md) |
| `formatGitHubAnnotations(report)`   | GitHub Actions annotations | [CI/CD Integration](./documentation/ci-cd-integration.md) |
| `verifyDeterministicBuild(options)` | Verify reproducible builds | [CI/CD Integration](./documentation/ci-cd-integration.md) |
| `signBundle(bundle, privateKey)`    | Sign a bundle with Ed25519 | [Bundle Signing](./documentation/bundle-signing.md)       |
| `verifyBundle(signedBundle)`        | Verify a signed bundle     | [Bundle Signing](./documentation/bundle-signing.md)       |
| `generateSigningKeyPair()`          | Generate Ed25519 key pair  | [Bundle Signing](./documentation/bundle-signing.md)       |

### Plugins & TypeScript

| Function                                   | Description                   | Docs                                                                |
| ------------------------------------------ | ----------------------------- | ------------------------------------------------------------------- |
| `createPlugin(name, configure, priority?)` | Create a bundler plugin       | [Plugin System](./documentation/plugin-system.md)                   |
| `mergePlugins(...arrays)`                  | Merge and deduplicate plugins | [Plugin System](./documentation/plugin-system.md)                   |
| `typeCheckWorkflows(path, options?)`       | TypeScript type checking      | [TypeScript Integration](./documentation/typescript-integration.md) |
| `generateWorkflowDeclarations(path, out)`  | Generate `.d.ts` files        | [TypeScript Integration](./documentation/typescript-integration.md) |
| `bundleForTesting(options)`                | Test bundle with mocks        | [Testing](./documentation/testing.md)                               |
| `checkSdkCompatibility(version?)`          | Check SDK version compat      | [SDK Compatibility](./documentation/sdk-compatibility.md)           |

## CLI

```
bundle-temporal-workflow <command> [options]
```

### Commands

| Command          | Description                                       |
| ---------------- | ------------------------------------------------- |
| `build <path>`   | Bundle workflow code for use with Temporal Worker |
| `analyze <path>` | Analyze bundle composition and dependencies       |
| `check <path>`   | Build and validate against size budgets           |
| `verify <path>`  | Verify build determinism (reproducible builds)    |
| `sign <path>`    | Sign a bundle with Ed25519                        |
| `keygen`         | Generate a new Ed25519 signing key pair           |
| `doctor`         | Validate environment and SDK compatibility        |

### Build Options

| Flag                      | Description                                   |
| ------------------------- | --------------------------------------------- |
| `-o, --output <file>`     | Output file path (default: stdout)            |
| `-s, --source-map <mode>` | Source map mode: `inline`, `external`, `none` |
| `-m, --mode <mode>`       | Build mode: `development`, `production`       |
| `-i, --ignore <module>`   | Ignore a module (can be repeated)             |
| `-w, --watch`             | Watch for changes and rebuild                 |
| `--interceptor <path>`    | Add interceptor module (can be repeated)      |
| `--payload-converter <p>` | Path to custom payload converter              |
| `--failure-converter <p>` | Path to custom failure converter              |
| `--json`                  | Output result as JSON                         |
| `--budget <size>`         | Size budget (e.g., `500KB`, `1MB`)            |
| `--ci`                    | CI-friendly output mode                       |
| `--strict`                | Strict validation (fail on warnings)          |
| `--private-key <path>`    | Ed25519 private key for signing               |
| `--public-key <path>`     | Ed25519 public key for verification           |
| `-v, --verbose`           | Enable verbose logging                        |

### Examples

```bash
# Bundle workflows
bundle-temporal-workflow build ./src/workflows.ts -o ./dist/bundle.js

# Production build with external source map
bundle-temporal-workflow build ./src/workflows.ts -o ./dist/bundle.js --mode production --source-map external

# Analyze bundle composition
bundle-temporal-workflow analyze ./src/workflows.ts

# Check against a size budget
bundle-temporal-workflow check ./src/workflows.ts --budget 500KB --strict

# Verify reproducible builds
bundle-temporal-workflow verify ./src/workflows.ts

# Generate signing keys
bundle-temporal-workflow keygen

# Sign a bundle
bundle-temporal-workflow sign ./dist/bundle.js --private-key ./keys/private.key

# Check environment
bundle-temporal-workflow doctor
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
| `tsconfigPath`               | `string \| boolean`                   | -               | Path to tsconfig.json for aliases   |
| `bundler`                    | `'esbuild' \| 'bun' \| 'auto'`        | `'auto'`        | Bundler backend to use              |
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

1. **Move to Activities**—Network calls, file I/O, and other side effects should be in Activities, not Workflows
2. **Use `ignoreModules`**—If a module is only used for types or is tree-shaken away, add it to `ignoreModules`
3. **Check the dependency chain**—The error message shows how the forbidden module was imported

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

[MIT](./LICENSE)
