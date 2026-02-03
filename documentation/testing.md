# Testing

Bundle workflows for testing with module mocking, relaxed determinism constraints, and fast caching.

## Quick Start

```typescript
import { bundleForTesting } from 'build-temporal-workflow';

const bundle = await bundleForTesting({
  workflowsPath: './src/workflows.ts',
  mocks: {
    './external-service': './test/mocks/external-service.ts',
  },
  relaxedDeterminism: true,
});
```

## API Reference

### `bundleForTesting(options)`

Bundle workflow code with test-specific configuration.

```typescript
function bundleForTesting(options: TestBundleOptions): Promise<WorkflowBundle>;
```

#### `TestBundleOptions`

Extends `BundleOptions` with:

| Option               | Type                     | Default | Description                           |
| -------------------- | ------------------------ | ------- | ------------------------------------- |
| `mocks`              | `Record<string, string>` | —       | Module path to mock path mappings     |
| `relaxedDeterminism` | `boolean`                | `false` | Allow some non-deterministic patterns |

All standard `BundleOptions` are also accepted.

### Module Mocking

The `mocks` option replaces module imports at build time. When a workflow imports a mocked module, the bundler resolves it to the mock file instead.

```typescript
const bundle = await bundleForTesting({
  workflowsPath: './src/workflows.ts',
  mocks: {
    // Replace relative imports
    './services/payment': './test/mocks/payment.ts',

    // Replace package imports
    'some-package': './test/mocks/some-package.ts',
  },
});
```

Mock files should export the same interface as the original module:

```typescript
// test/mocks/payment.ts
export async function processPayment(amount: number) {
  return { success: true, transactionId: 'mock-tx-123' };
}
```

### Relaxed Determinism

When `relaxedDeterminism: true`, the bundler allows patterns that would normally be forbidden in workflow code:

- `Date.now()` and `new Date()` — useful for test assertions
- `Math.random()` — useful for generating test data
- Other non-deterministic APIs that tests may need for setup or assertions

This does **not** affect the runtime determinism enforcement by Temporal's sandbox. It only suppresses build-time warnings.

### In-Memory Caching

Use `getCachedBundle` for test suites to avoid rebuilding the same bundle:

```typescript
import { getCachedBundle, clearBundleCache } from 'build-temporal-workflow';

describe('Order Workflow', () => {
  let bundle;

  beforeAll(async () => {
    // First call builds (~50ms), subsequent calls return cached (~0ms)
    bundle = await getCachedBundle({
      workflowsPath: './src/workflows.ts',
    });
  });

  afterAll(() => {
    clearBundleCache();
  });

  it('should process order', async () => {
    const worker = await Worker.create({
      workflowBundle: bundle,
      taskQueue: 'test-queue',
    });
    // ...
  });
});
```

### Preloading Multiple Bundles

```typescript
import { preloadBundles } from 'build-temporal-workflow';

// Warm the cache before tests run
beforeAll(async () => {
  await preloadBundles([
    { workflowsPath: './src/workflows/order.ts' },
    { workflowsPath: './src/workflows/user.ts' },
    { workflowsPath: './src/workflows/notification.ts' },
  ]);
});
```

## Examples

### Integration test with mocked dependencies

```typescript
import { bundleForTesting } from 'build-temporal-workflow';
import { Worker, TestWorkflowEnvironment } from '@temporalio/testing';

describe('Order Workflow', () => {
  let testEnv;
  let bundle;

  beforeAll(async () => {
    testEnv = await TestWorkflowEnvironment.createLocal();

    bundle = await bundleForTesting({
      workflowsPath: './src/workflows/order.ts',
      mocks: {
        './services/inventory': './test/mocks/inventory.ts',
        './services/payment': './test/mocks/payment.ts',
      },
    });
  });

  afterAll(async () => {
    await testEnv?.teardown();
  });

  it('should complete order', async () => {
    const worker = await Worker.create({
      connection: testEnv.nativeConnection,
      workflowBundle: bundle,
      taskQueue: 'test-orders',
      activities: {
        // Real or mocked activities
      },
    });

    const result = await worker.runUntil(async () => {
      const handle = await testEnv.client.workflow.start('orderWorkflow', {
        args: [{ orderId: '123', items: ['item-1'] }],
        taskQueue: 'test-orders',
        workflowId: 'test-order-123',
      });
      return await handle.result();
    });

    expect(result.status).toBe('completed');
  });
});
```

### Content-hash based caching for CI

```typescript
import { getCachedBundle } from 'build-temporal-workflow';

// In CI, use content-hash based cache invalidation
// to avoid rebuilding when source hasn't changed
const bundle = await getCachedBundle({
  workflowsPath: './src/workflows.ts',
  useContentHash: true,
  forceRebuild: false,
});
```

### Disk caching for persistent test speed

```typescript
import { createDiskCache, bundleWorkflowCode } from 'build-temporal-workflow';

const cache = createDiskCache({
  cacheDir: '.cache/test-bundles',
  maxAge: 24 * 60 * 60 * 1000, // 1 day
});

async function getBundle(workflowsPath: string) {
  const cached = cache.get(workflowsPath);
  if (cached) return cached;

  const bundle = await bundleWorkflowCode({ workflowsPath });
  cache.set(workflowsPath, bundle);
  return bundle;
}
```

## Related

- [Determinism Checking](./determinism-checking.md) — Understanding determinism constraints
- [Multi-Queue Builds](./multi-queue-builds.md) — Test bundles for multiple queues
- [Workflow Validation](./workflow-validation.md) — Validate exports in tests
