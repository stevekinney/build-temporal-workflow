# Multi-Queue Builds

Bundle workflows and activities across multiple Temporal task queues in a single operation, sharing configuration and build context for efficiency.

## Quick Start

```typescript
import { bundleMultipleWorkflows } from 'build-temporal-workflow';

const results = await bundleMultipleWorkflows({
  queues: [
    { name: 'orders', workflowsPath: './src/workflows/orders.ts' },
    { name: 'users', workflowsPath: './src/workflows/users.ts' },
    { name: 'notifications', workflowsPath: './src/workflows/notifications.ts' },
  ],
  shared: {
    tsconfigPath: './tsconfig.json',
    mode: 'production',
  },
});

for (const [name, bundle] of results) {
  console.log(`${name}: ${bundle.code.length} bytes`);
}
```

## API Reference

### `bundleMultipleWorkflows(options)`

Bundles workflows for multiple task queues concurrently, sharing configuration.

```typescript
function bundleMultipleWorkflows(
  options: MultiBundleOptions,
): Promise<Map<string, WorkflowBundle>>;
```

#### `MultiBundleOptions`

| Option   | Type            | Description                                |
| -------- | --------------- | ------------------------------------------ |
| `queues` | `QueueConfig[]` | List of queue configurations to bundle     |
| `shared` | `object`        | Shared configuration applied to all queues |

#### `QueueConfig`

| Option           | Type     | Description                               |
| ---------------- | -------- | ----------------------------------------- |
| `name`           | `string` | Name of the task queue                    |
| `workflowsPath`  | `string` | Path to workflow source file or directory |
| `activitiesPath` | `string` | Path to activities source file (optional) |

#### Shared options

| Option          | Type              | Description                        |
| --------------- | ----------------- | ---------------------------------- |
| `tsconfigPath`  | `string`          | Shared tsconfig.json path          |
| `plugins`       | `BundlerPlugin[]` | Shared plugins                     |
| `mode`          | `string`          | `'development'` or `'production'`  |
| `sourceMap`     | `string`          | `'inline'`, `'external'`, `'none'` |
| `ignoreModules` | `string[]`        | Modules to exclude                 |
| `logger`        | `Logger`          | Shared logger                      |

### `createMultiBundlers(options)`

Creates `WorkflowCodeBundler` instances for multiple queues. Use when you need reusable build contexts or watch mode.

```typescript
function createMultiBundlers(
  options: MultiBundleOptions,
): Map<string, WorkflowCodeBundler>;
```

```typescript
const bundlers = createMultiBundlers({
  queues: [
    { name: 'orders', workflowsPath: './src/workflows/orders.ts' },
    { name: 'users', workflowsPath: './src/workflows/users.ts' },
  ],
  shared: { mode: 'production' },
});

// Create reusable build contexts
for (const [name, bundler] of bundlers) {
  const ctx = await bundler.createContext();
  const bundle = await ctx.rebuild();
  // ...
  await ctx.dispose();
}
```

### `bundleActivityCode(options)`

Bundles activity implementations separately from workflow code. Activity bundles can include non-deterministic code, network calls, and file system access.

```typescript
function bundleActivityCode(options: ActivityBundleOptions): Promise<ActivityBundle>;
```

#### `ActivityBundleOptions`

| Option           | Type       | Default | Description                       |
| ---------------- | ---------- | ------- | --------------------------------- |
| `activitiesPath` | `string`   | —       | Path to activities source file    |
| `format`         | `string`   | `'esm'` | Output format: `'esm'` or `'cjs'` |
| `minify`         | `boolean`  | `false` | Whether to minify the output      |
| `external`       | `string[]` | —       | External packages to exclude      |
| `logger`         | `Logger`   | —       | Optional logger                   |

#### `ActivityBundle`

| Field           | Type       | Description                         |
| --------------- | ---------- | ----------------------------------- |
| `code`          | `string`   | Bundled JavaScript code             |
| `sourceMap`     | `string`   | Source map (if generated)           |
| `activityNames` | `string[]` | List of exported activity functions |

### `watchTemporalCode(options)`

Coordinated watch mode for workflow and activity bundles across multiple queues.

```typescript
function watchTemporalCode(options: WatchCoordinatorOptions): CoordinatedWatchHandle;
```

```typescript
import { watchTemporalCode } from 'build-temporal-workflow';

const handle = watchTemporalCode({
  queues: [
    {
      name: 'orders',
      workflowsPath: './src/workflows/orders.ts',
      activitiesPath: './src/activities/orders.ts',
    },
  ],
  debounce: 150,
  onChange: (queueName, type, bundle, error) => {
    if (error) {
      console.error(`[${queueName}] ${type} build failed:`, error);
    } else {
      console.log(`[${queueName}] ${type} rebuilt`);
    }
  },
});

// Later, stop all watchers
handle.stop();
```

## Examples

### Multi-queue Worker setup

```typescript
import { Worker } from '@temporalio/worker';
import { bundleMultipleWorkflows } from 'build-temporal-workflow';

const bundles = await bundleMultipleWorkflows({
  queues: [
    { name: 'orders', workflowsPath: './src/workflows/orders.ts' },
    { name: 'users', workflowsPath: './src/workflows/users.ts' },
  ],
  shared: { mode: 'production', sourceMap: 'external' },
});

// Create a worker for each queue
const workers = await Promise.all(
  Array.from(bundles.entries()).map(([queueName, bundle]) =>
    Worker.create({
      workflowBundle: bundle,
      taskQueue: queueName,
      activities: require(`./activities/${queueName}`),
    }),
  ),
);
```

### Development watch mode with hot reload

```typescript
import { watchTemporalCode } from 'build-temporal-workflow';

let workers = new Map();

const handle = watchTemporalCode({
  queues: [
    {
      name: 'orders',
      workflowsPath: './src/workflows/orders.ts',
      activitiesPath: './src/activities/orders.ts',
    },
    {
      name: 'users',
      workflowsPath: './src/workflows/users.ts',
      activitiesPath: './src/activities/users.ts',
    },
  ],
  onChange: async (queueName, type, bundle, error) => {
    if (error) {
      console.error(`[${queueName}] ${type} build error:`, error.message);
      return;
    }

    if (type === 'workflow') {
      // Restart the worker with the new bundle
      const existing = workers.get(queueName);
      if (existing) await existing.shutdown();

      workers.set(
        queueName,
        await Worker.create({
          workflowBundle: bundle,
          taskQueue: queueName,
        }),
      );
    }
  },
});
```

## Related

- [Bundle Analysis](./bundle-analysis.md) — Analyze size of individual queue bundles
- [CI/CD Integration](./ci-cd-integration.md) — Multi-queue builds in CI pipelines
- [Testing](./testing.md) — Test bundles for specific queues
