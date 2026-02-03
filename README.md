# build-temporal-workflow

A drop-in replacement for `@temporalio/worker`'s `bundleWorkflowCode` that swaps Webpack for esbuild (or Bun.build). Same API, same output, 9-11x faster builds, 94% less memory.

## The Problem

Every Temporal TypeScript Worker needs to bundle workflow code into a self-contained isolate-safe package. The official SDK uses Webpack for this. Webpack works, but it was designed for frontend asset pipelines, not for bundling a few hundred KB of deterministic workflow code. The result: 500-630ms builds that allocate 50+ MB of heap, every single time. In a test suite that spins up Workers, that overhead multiplies fast.

This library replaces the Webpack bundler with esbuild, which is purpose-built for speed. esbuild is written in Go, does its own parsing and code generation, and can bundle the same workflow code in 49-57ms on Node or under 32ms on Bun. Memory drops by 94%. The output is identical in structure: a CJS bundle that assigns `globalThis.__TEMPORAL__` and works with any standard Temporal Worker.

If you're running under Bun, you also get access to `Bun.build` as a backend, which is even faster for small-to-medium bundles.

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

The benchmark suite includes statistical analysis with 95% confidence intervals, outlier detection (IQR method), and significance testing (Welch's t-test).

## Why This Library Exists

The `bundleWorkflowCode` function in `@temporalio/worker` does two things: it resolves your workflow code's dependency graph, and it concatenates everything into a single CJS file that can run inside Temporal's V8 isolate. That's it. There's no code splitting, no asset pipeline, no HMR, no loader ecosystem to support. It's a straightforward bundling job.

Webpack is an extraordinarily capable tool, but its generality is a liability here. It parses its own configuration schema, initializes a plugin system, builds a module graph through its own resolution algorithm, and runs multiple optimization passes — all for a bundle that _must not be minified_ and _must not be tree-shaken_ (both break workflow determinism). The result is 500-630ms of wall time and 50+ MB of heap allocation for what amounts to concatenating ~60 modules.

esbuild does the same job in 49-59ms because it was designed from the ground up for speed: single-pass architecture, Go's compile-time optimizations, and zero configuration overhead. This library wraps esbuild with the same plugin hooks that Temporal needs (forbidden module detection, determinism policy enforcement, module stub injection) and produces output that is structurally identical to what Webpack generates.

The practical impact shows up in three places:

1. **Test suites.** If your tests create Workers (and they should — integration tests catch real bugs), each test pays the bundling cost. A suite with 20 Worker-creating tests goes from ~10s of bundling overhead to ~1s with esbuild, or ~0.6s with Bun.build. Add the in-memory cache and the second through twentieth tests pay ~0ms.

2. **Development iteration.** Watch mode with esbuild's incremental rebuild is nearly instant. Webpack's watch mode works but carries the same per-build overhead.

3. **CI pipelines.** Faster bundling means faster deployments. The memory savings also matter in constrained CI environments where you're running multiple jobs on shared runners.

This library is a drop-in replacement. Same function signature, same output shape, same `WorkflowBundle` type. Swap the import and your Workers keep working.

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

- `Date.now()` — Use `workflow.currentTime()` instead
- `Math.random()` — Use `workflow.random()` instead
- `setTimeout`/`setInterval` — Use `workflow.sleep()` instead
- `fetch`/`axios` — Move to Activities
- `crypto.randomBytes()` — Use `workflow.uuid4()` or move to Activities

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

The official `@temporalio/worker` bundler can do this too, but requires manual webpack configuration and installing additional loaders:

```typescript
// With @temporalio/worker, you'd need:
bundleWorkflowCode({
  workflowsPath: '...',
  webpackConfigHook: (config) => {
    config.module.rules.push(
      { test: /\.md$/, type: 'asset/source' },
      { test: /\.toml$/, loader: 'toml-loader' },
      { test: /\.ya?ml$/, loader: 'yaml-loader' },
    );
    return config;
  },
});
// Plus: npm install toml-loader yaml-loader
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

### WorkflowCodeBundler

Class-based API for more control over the bundling lifecycle. Supports reusable build contexts and watch mode.

```typescript
import { WorkflowCodeBundler } from 'build-temporal-workflow';

const bundler = new WorkflowCodeBundler({
  workflowsPath: './src/workflows.ts',
});

// One-off build
const bundle = await bundler.createBundle();

// Reusable context for repeated builds (e.g., test suites)
const ctx = await bundler.createContext();
const bundle1 = await ctx.rebuild();
// ... modify workflow files ...
const bundle2 = await ctx.rebuild(); // Much faster
await ctx.dispose();

// Watch mode
const handle = await bundler.watch((bundle, error) => {
  if (error) console.error(error);
  else console.log('Rebuilt:', bundle.code.length, 'bytes');
});
await handle.stop();
```

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

  // Optional: Bundler backend (default: 'auto')
  bundler: 'esbuild' | 'bun' | 'auto',

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

### createConsoleLogger()

Create a console-based logger for development. Compatible with the `Logger` option.

```typescript
import { createConsoleLogger, bundleWorkflowCode } from 'build-temporal-workflow';

const bundle = await bundleWorkflowCode({
  workflowsPath: './src/workflows.ts',
  logger: createConsoleLogger(),
});
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

Get a bundle, using cache when possible. Cache is invalidated when workflow files change.

```typescript
import {
  getCachedBundle,
  clearBundleCache,
  getBundleCacheStats,
} from 'build-temporal-workflow';

const bundle = await getCachedBundle({
  workflowsPath: './src/workflows',
  forceRebuild: false, // Set true to bypass cache
  useContentHash: true, // Content-based invalidation (recommended for CI)
});

// Clear all cached bundles
clearBundleCache();

// Inspect cache state
const stats = getBundleCacheStats();
console.log(`${stats.size} bundles cached`);
```

### preloadBundles(optionsList)

Preload multiple bundles into the cache concurrently. Useful for warming up the cache before running tests.

```typescript
import { preloadBundles } from 'build-temporal-workflow';

await preloadBundles([
  { workflowsPath: './src/workflows/order.ts' },
  { workflowsPath: './src/workflows/user.ts' },
  { workflowsPath: './src/workflows/notification.ts' },
]);
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

// Analyze a single file
const fileResult = analyzeFileReplaySafety(
  './src/workflows/order.ts',
  REPLAY_UNSAFE_PATTERNS,
);

// Access the built-in pattern list
import { REPLAY_UNSAFE_PATTERNS } from 'build-temporal-workflow';
console.log(REPLAY_UNSAFE_PATTERNS.map((p) => p.name));
```

### generateManifest(options)

Generate a manifest of workflow exports.

```typescript
import {
  generateManifest,
  compareManifests,
  serializeManifest,
  parseManifest,
} from 'build-temporal-workflow';

const manifest = generateManifest({
  workflowsPath: './src/workflows',
  bundleCode: bundle.code,
  includeSourceHashes: true,
});

// Compare two manifests
const diff = compareManifests(oldManifest, newManifest);

// Serialize/deserialize for storage
const json = serializeManifest(manifest);
const restored = parseManifest(json);
```

### validateBundle(bundle, options)

Validate a bundle is properly structured.

```typescript
import {
  validateBundle,
  validateBundleDetailed,
  validateBundleStructure,
} from 'build-temporal-workflow';

// Quick structure check
const structureResult = validateBundleStructure(bundle.code);
if (!structureResult.valid) {
  throw new Error(structureResult.error);
}

// Full validation with version check
const result = validateBundle(bundle, {
  workerVersion: '1.14.0',
});

// Detailed validation with separate errors and warnings
const detailed = validateBundleDetailed(bundle, {
  expectedSdkVersion: '1.14.0',
  strictVersionCheck: true,
  validateStructure: true,
});

if (!detailed.valid) {
  console.error('Errors:', detailed.errors);
}
if (detailed.warnings.length > 0) {
  console.warn('Warnings:', detailed.warnings);
}
console.log('Metadata:', detailed.metadata);
```

### WorkflowBundleError

Structured error class thrown when bundling fails. Contains a machine-readable `code` and contextual information.

```typescript
import { WorkflowBundleError } from 'build-temporal-workflow';

try {
  await bundleWorkflowCode({ workflowsPath: './src/workflows.ts' });
} catch (error) {
  if (error instanceof WorkflowBundleError) {
    console.log(error.code); // e.g. 'FORBIDDEN_MODULES', 'DYNAMIC_IMPORT'
    console.log(error.context); // { modules, details, hint, dependencyChain, violations }
  }
}
```

Error codes: `FORBIDDEN_MODULES`, `DYNAMIC_IMPORT`, `RESOLUTION_FAILED`, `IGNORED_MODULE_USED`, `CONFIG_INVALID`, `BUILD_FAILED`, `ENTRYPOINT_NOT_FOUND`.

### Advanced: Determinism Policy

Low-level functions for inspecting and working with the module determinism policy.

```typescript
import {
  loadDeterminismPolicy,
  moduleMatches,
  normalizeSpecifier,
  isForbidden,
  isAllowedBuiltin,
  getModuleOverridePath,
  ALLOWED_BUILTINS,
} from 'build-temporal-workflow';

const policy = loadDeterminismPolicy();

// Check if a module is forbidden
isForbidden('fs', policy); // true
isForbidden('lodash', policy); // false

// Check if a module has a Temporal stub
isAllowedBuiltin('assert'); // true

// Normalize specifiers (strips node: prefix, etc.)
normalizeSpecifier('node:fs'); // 'fs'

// Check if a user module matches any in a list
moduleMatches('node:fs', ['fs']); // true

// Get path to the Temporal stub for an allowed builtin
getModuleOverridePath('assert'); // path to stub

// Built-in allowed modules
console.log(ALLOWED_BUILTINS); // ['assert', 'url', 'util']
```

### Advanced: esbuild Plugin

Create the Temporal esbuild plugin directly for custom build pipelines.

```typescript
import { createTemporalPlugin } from 'build-temporal-workflow';

const { plugin, state } = createTemporalPlugin({
  ignoreModules: ['dns'],
  policy: loadDeterminismPolicy(),
});

// Use `plugin` in your own esbuild.build() call
// After build, inspect `state.foundProblematicModules` and `state.dynamicImports`
```

### Advanced: Dependency Chain Analysis

Analyze how forbidden modules are reached from the entrypoint using esbuild metafile data.

```typescript
import {
  findDependencyChain,
  findAllDependencyChains,
  formatDependencyChain,
  summarizeDependencyChain,
} from 'build-temporal-workflow';

// Find the import chain to a specific module
const chain = findDependencyChain(metafile, problematicModules, 'fs');

// Find chains for all problematic modules
const allChains = findAllDependencyChains(metafile, problematicModules);

// Format for display
const formatted = formatDependencyChain(chain); // ['workflows.ts', '→ helper.ts', '→ fs']
const summary = summarizeDependencyChain(chain); // 'workflows.ts → helper.ts → fs'
```

### Advanced: File Loader Plugins

Opt-in plugins for importing static files. Available as submodule exports for tree-shaking.

```typescript
// Import all loaders
import {
  textLoader,
  markdownLoader,
  tomlLoader,
  yamlLoader,
} from 'build-temporal-workflow/plugins';

// Or import individually (better for tree-shaking)
import { textLoader } from 'build-temporal-workflow/plugins/text';
import { markdownLoader } from 'build-temporal-workflow/plugins/markdown';
import { tomlLoader } from 'build-temporal-workflow/plugins/toml';
import { yamlLoader } from 'build-temporal-workflow/plugins/yaml';

// Use with bundleWorkflowCode
const bundle = await bundleWorkflowCode({
  workflowsPath: './src/workflows.ts',
  buildOptions: {
    plugins: [textLoader(), tomlLoader(), yamlLoader()],
  },
});

// Or use directly with esbuild
import * as esbuild from 'esbuild';

await esbuild.build({
  entryPoints: ['./src/index.ts'],
  bundle: true,
  plugins: [textLoader(), tomlLoader(), yamlLoader()],
});

// Customize extensions
textLoader({ extensions: ['.txt', '.md', '.text'] });
tomlLoader({ extensions: ['.toml', '.tml'] });
yamlLoader({ extensions: ['.yaml', '.yml', '.eyaml'] });
```

Works with both esbuild and Bun.build backends.

### Advanced: Cross-Runtime Utilities

Utilities for working with Deno and Bun import conventions.

```typescript
import {
  detectInputFlavor,
  resolveCrossRuntimeConfig,
  createCrossRuntimePlugin,
  parseDenoConfig,
  parseImportMap,
  loadImportMap,
  isNpmSpecifier,
  parseNpmSpecifier,
  isUrlImport,
  isUrlPinned,
  detectForbiddenRuntimeApis,
} from 'build-temporal-workflow';

// Auto-detect runtime flavor from config files
const flavor = detectInputFlavor('./src/workflows.ts'); // 'node' | 'deno' | 'bun'

// Resolve full cross-runtime config
const config = resolveCrossRuntimeConfig('./src/workflows.ts', 'auto');

// Create an esbuild plugin for cross-runtime resolution
const plugin = createCrossRuntimePlugin(config, './src/workflows.ts');

// Parse Deno config and import maps
const denoConfig = parseDenoConfig('./deno.json');
const importMap = parseImportMap('./import_map.json');
const resolvedMap = loadImportMap('./src/workflows.ts');

// Work with npm: specifiers
isNpmSpecifier('npm:lodash@4.17.21'); // true
parseNpmSpecifier('npm:lodash@4.17.21'); // { name: 'lodash', version: '4.17.21', subpath: undefined }

// Detect URL imports and pinning
isUrlImport('https://deno.land/std/path/mod.ts'); // true
isUrlPinned('https://deno.land/std@0.200.0/path/mod.ts'); // true

// Detect forbidden runtime-specific APIs in source
const violations = detectForbiddenRuntimeApis(sourceCode, 'deno');
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
