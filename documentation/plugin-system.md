# Plugin System

Compose, prioritize, and create plugins for the workflow bundler. Includes smart tree-shaking with selective export preservation.

## Quick Start

```typescript
import { createPlugin, mergePlugins, bundleWorkflowCode } from 'build-temporal-workflow';

const myPlugin = createPlugin('my-plugin', (options) => ({
  ...options,
  mode: 'production',
}));

const bundle = await bundleWorkflowCode({
  workflowsPath: './src/workflows.ts',
  plugins: [myPlugin],
});
```

## API Reference

### Plugin Interfaces

#### `BundlerPlugin`

The base plugin interface:

```typescript
interface BundlerPlugin {
  readonly name: string;
  configureBundler?(options: BundleOptions): BundleOptions;
}
```

#### `ExtendedBundlerPlugin`

Plugin with priority ordering:

```typescript
interface ExtendedBundlerPlugin extends BundlerPlugin {
  priority?: number; // Lower values run first. Default: 100
}
```

### Plugin Composition

#### `composePlugins(esbuildPlugins?, bunPlugins?)`

Merge esbuild and Bun plugin arrays into a unified `ComposedPlugins` object.

```typescript
function composePlugins(
  esbuildPlugins?: esbuild.Plugin[],
  bunPlugins?: BunPlugin[],
): ComposedPlugins;
```

```typescript
import { composePlugins } from 'build-temporal-workflow';
import { textLoader, tomlLoader } from 'build-temporal-workflow/plugins';

const composed = composePlugins([textLoader(), tomlLoader()], []);
```

#### `sortPluginsByPriority(plugins)`

Sort `ExtendedBundlerPlugin` instances by their `priority` field. Lower values run first.

```typescript
function sortPluginsByPriority(plugins: ExtendedBundlerPlugin[]): ExtendedBundlerPlugin[];
```

#### `mergePlugins(...pluginArrays)`

Concatenate multiple plugin arrays and deduplicate by name.

```typescript
function mergePlugins(...pluginArrays: BundlerPlugin[][]): BundlerPlugin[];
```

```typescript
import { mergePlugins } from 'build-temporal-workflow';

const allPlugins = mergePlugins(sharedPlugins, queueSpecificPlugins);
```

### Plugin Factories

#### `createPlugin(name, configureBundler?, priority?)`

Create an `ExtendedBundlerPlugin` from scratch.

```typescript
function createPlugin(
  name: string,
  configureBundler?: (options: BundleOptions) => BundleOptions,
  priority?: number,
): ExtendedBundlerPlugin;
```

```typescript
import { createPlugin } from 'build-temporal-workflow';

const productionDefaults = createPlugin(
  'production-defaults',
  (options) => ({
    ...options,
    mode: 'production',
    sourceMap: 'external',
  }),
  50, // Run before default plugins (priority 100)
);
```

#### `createEsbuildPluginAdapter(name, esbuildPlugin, priority?)`

Wrap an existing esbuild plugin as an `ExtendedBundlerPlugin`.

```typescript
function createEsbuildPluginAdapter(
  name: string,
  esbuildPlugin: esbuild.Plugin,
  priority?: number,
): ExtendedBundlerPlugin;
```

```typescript
import { createEsbuildPluginAdapter } from 'build-temporal-workflow';

const adapted = createEsbuildPluginAdapter(
  'my-esbuild-plugin',
  myExistingEsbuildPlugin,
  200, // Run after default plugins
);
```

### Export Preservation (Tree Shaking)

#### `createPreserveExportsPlugin(options?)`

Create an esbuild plugin for selective export preservation. Keeps workflow exports intact while allowing unused internal code to be removed.

```typescript
function createPreserveExportsPlugin(options?: PreserveExportsOptions): esbuild.Plugin;
```

```typescript
import { createPreserveExportsPlugin, bundleWorkflowCode } from 'build-temporal-workflow';

const bundle = await bundleWorkflowCode({
  workflowsPath: './src/workflows.ts',
  buildOptions: {
    plugins: [createPreserveExportsPlugin()],
  },
});
```

#### `PreserveExportsOptions`

| Field      | Type       | Description                                |
| ---------- | ---------- | ------------------------------------------ |
| `exports`  | `string[]` | Specific export names to preserve          |
| `patterns` | `RegExp[]` | Patterns matching export names to preserve |

#### `analyzeRequiredExports(code)`

Analyze workflow source code to determine which exports must be preserved.

```typescript
function analyzeRequiredExports(code: string): string[];
```

```typescript
import { analyzeRequiredExports } from 'build-temporal-workflow';

const exports = analyzeRequiredExports(workflowSourceCode);
console.log('Required exports:', exports);
// ['orderWorkflow', 'userWorkflow', 'notificationWorkflow']
```

## Examples

### Plugin priority ordering

```typescript
import { createPlugin, sortPluginsByPriority } from 'build-temporal-workflow';

const plugins = sortPluginsByPriority([
  createPlugin('late-plugin', (opts) => opts, 200),
  createPlugin('early-plugin', (opts) => opts, 10),
  createPlugin('default-plugin', (opts) => opts), // priority: 100
]);

// Execution order: early-plugin (10), default-plugin (100), late-plugin (200)
```

### Combining plugins from multiple sources

```typescript
import { mergePlugins, createPlugin } from 'build-temporal-workflow';

const teamPlugins = [
  createPlugin('team-defaults', (opts) => ({
    ...opts,
    sourceMap: 'external',
  })),
];

const projectPlugins = [
  createPlugin('project-config', (opts) => ({
    ...opts,
    ignoreModules: [...(opts.ignoreModules ?? []), 'debug'],
  })),
];

// Merge and deduplicate
const allPlugins = mergePlugins(teamPlugins, projectPlugins);

const bundle = await bundleWorkflowCode({
  workflowsPath: './src/workflows.ts',
  plugins: allPlugins,
});
```

### Using the esbuild plugin directly

For custom build pipelines, you can use `createTemporalPlugin()` directly:

```typescript
import { createTemporalPlugin, loadDeterminismPolicy } from 'build-temporal-workflow';
import * as esbuild from 'esbuild';

const policy = loadDeterminismPolicy();
const { plugin, state } = createTemporalPlugin({
  ignoreModules: ['dns'],
  policy,
});

const result = await esbuild.build({
  stdin: { contents: entryCode, resolveDir: '.' },
  bundle: true,
  format: 'cjs',
  plugins: [plugin],
  write: false,
});

// Inspect state after build
if (state.foundProblematicModules.size > 0) {
  console.error('Forbidden modules found:', [...state.foundProblematicModules]);
}
```

## Related

- [Workflow Validation](./workflow-validation.md) — Validate exports before bundling
- [TypeScript Integration](./typescript-integration.md) — Type checking plugins
- [SDK Compatibility](./sdk-compatibility.md) — Instrumentation plugins
