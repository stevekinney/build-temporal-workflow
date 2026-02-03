# SDK Compatibility

Check version compatibility between the bundler, the Temporal SDK used during bundling, and the worker SDK at runtime. Includes development-mode instrumentation for debugging.

## Quick Start

```typescript
import { checkSdkCompatibility, formatCompatibilityInfo } from 'build-temporal-workflow';

const compat = checkSdkCompatibility('1.14.1');
console.log(formatCompatibilityInfo(compat));

if (!compat.compatible) {
  console.error('SDK version mismatch detected');
  for (const warning of compat.warnings) {
    console.error(`  ${warning}`);
  }
}
```

## API Reference

### Version Compatibility

#### `checkSdkCompatibility(workerSdkVersion?)`

Check compatibility between the bundler version, the `@temporalio/workflow` SDK version used during bundling, and the worker SDK version at runtime.

```typescript
function checkSdkCompatibility(workerSdkVersion?: string): SdkCompatibility;
```

#### `SdkCompatibility`

| Field              | Type       | Description                          |
| ------------------ | ---------- | ------------------------------------ |
| `bundlerVersion`   | `string`   | Version of `build-temporal-workflow` |
| `bundleSdkVersion` | `string`   | SDK version used during bundling     |
| `workerSdkVersion` | `string`   | SDK version of the running worker    |
| `compatible`       | `boolean`  | Whether versions are compatible      |
| `warnings`         | `string[]` | Compatibility warnings               |

Compatibility rules:

- Major version mismatch between bundle SDK and worker SDK is an error
- Minor version mismatch produces a warning
- Patch version differences are considered compatible

#### `formatCompatibilityInfo(compat)`

Format compatibility information for display.

```typescript
function formatCompatibilityInfo(compat: SdkCompatibility): string;
```

### Instrumentation

#### `createInstrumentationPlugin(options?)`

Create an esbuild plugin that injects development-mode tracing hooks into workflow and activity function calls.

```typescript
function createInstrumentationPlugin(options?: InstrumentationOptions): esbuild.Plugin;
```

```typescript
import { createInstrumentationPlugin, bundleWorkflowCode } from 'build-temporal-workflow';

const bundle = await bundleWorkflowCode({
  workflowsPath: './src/workflows.ts',
  buildOptions: {
    plugins: [
      createInstrumentationPlugin({
        traceWorkflowCalls: true,
        traceActivityCalls: true,
      }),
    ],
  },
});
```

#### `InstrumentationOptions`

| Option                  | Type      | Default | Description                          |
| ----------------------- | --------- | ------- | ------------------------------------ |
| `traceWorkflowCalls`    | `boolean` | `false` | Trace workflow function entry/exit   |
| `traceActivityCalls`    | `boolean` | `false` | Trace activity proxy calls           |
| `treeShakeInProduction` | `boolean` | `true`  | Remove instrumentation in production |

When `treeShakeInProduction` is `true` (default), instrumentation code is automatically removed when `mode: 'production'` is set, so there's no performance impact in production builds.

#### `generateWorkflowTracing(functionName)`

Generate wrapper code for tracing a workflow function. Used internally by the instrumentation plugin.

#### `generateActivityTracing()`

Generate wrapper code for tracing activity proxy calls.

### Doctor Command

The CLI `doctor` command checks your environment for SDK compatibility:

```bash
bundle-temporal-workflow doctor

# Output:
# ✓ Bundler Version: bundle-temporal-workflow v0.3.0
# ✓ Temporal SDK: @temporalio/workflow v1.14.1
# ✓ Temporal Worker: @temporalio/worker is installed
# ✓ Module Overrides: Temporal module stubs are available
# ✓ esbuild: esbuild v0.27.2
# ✓ Node.js: Node.js v24.3.0
# ✓ Bun Runtime: Bun v1.3.2
#
# All checks passed
```

JSON output:

```bash
bundle-temporal-workflow doctor --json
```

## Examples

### Runtime compatibility check in worker startup

```typescript
import { checkSdkCompatibility } from 'build-temporal-workflow';

// Check before creating workers
const compat = checkSdkCompatibility(require('@temporalio/worker/package.json').version);

if (!compat.compatible) {
  throw new Error(
    `SDK version mismatch: bundle was built with ${compat.bundleSdkVersion}, ` +
      `but worker is running ${compat.workerSdkVersion}`,
  );
}

if (compat.warnings.length > 0) {
  console.warn('SDK compatibility warnings:', compat.warnings);
}
```

### Development instrumentation

```typescript
import { createInstrumentationPlugin, bundleWorkflowCode } from 'build-temporal-workflow';

const isDev = process.env.NODE_ENV !== 'production';

const bundle = await bundleWorkflowCode({
  workflowsPath: './src/workflows.ts',
  mode: isDev ? 'development' : 'production',
  buildOptions: {
    plugins: isDev
      ? [
          createInstrumentationPlugin({
            traceWorkflowCalls: true,
            traceActivityCalls: true,
          }),
        ]
      : [],
  },
});
```

### Version matrix

| Bundler Version | Temporal SDK   | Status      |
| --------------- | -------------- | ----------- |
| 0.3.x           | 1.14.x         | Supported   |
| 0.3.x           | 1.13.x         | Compatible  |
| 0.3.x           | 1.x.x (< 1.13) | Warning     |
| 0.3.x           | 2.x.x          | Unsupported |

## Related

- [CI/CD Integration](./ci-cd-integration.md) — Compatibility checks in CI
- [Plugin System](./plugin-system.md) — Plugin architecture
- [Testing](./testing.md) — Test-mode instrumentation
