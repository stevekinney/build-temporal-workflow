# Ignoring Modules

The `ignoreModules` option tells the bundler to replace specific modules with runtime-throwing stubs instead of including their code in the bundle. This is an escape hatch for when your workflow code has imports that can't be resolved or bundled but aren't actually executed at runtime.

## How It Works

When you add a module to `ignoreModules`, the bundler:

1. Intercepts the import during resolution
2. Replaces the module with a [Proxy](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Proxy) stub
3. The stub allows the import to succeed at bundle time
4. If any export from the stub is accessed at runtime, it throws an error

The stub looks like this conceptually:

```javascript
// Every property access or function call throws
const stub = new Proxy(function () {}, {
  get(_, prop) {
    throw new Error(
      'Module "fs" was ignored during bundling but was executed at runtime.',
    );
  },
  apply() {
    throw new Error(
      'Module "fs" was ignored during bundling but was executed at runtime.',
    );
  },
});
module.exports = stub;
```

This means the import itself won't fail, but the moment your code tries to _use_ anything from that module, it throws immediately with a clear message.

## When to Use It

### A dependency imports something it doesn't use in your code path

This is the most common case. A library you depend on imports a Node.js builtin somewhere in its source, but the code path your workflow actually hits never reaches that import.

```typescript
// some-lib/index.ts
import { readFileSync } from 'fs'; // Used only in loadFromDisk()
import { parse } from './parser'; // Used in your workflow

export { loadFromDisk, parse };
```

```typescript
// Your workflow only uses parse(), never loadFromDisk()
import { parse } from 'some-lib';

export async function myWorkflow(input: string) {
  return parse(input);
}
```

Without `ignoreModules`, the bundler rejects the build because `fs` is forbidden. With it:

```typescript
const bundle = await bundleWorkflowCode({
  workflowsPath: './src/workflows.ts',
  ignoreModules: ['fs'],
});
```

The bundle succeeds. Since `loadFromDisk()` is never called, the `fs` stub is never accessed, and the workflow runs fine.

### A module is used only for type information

If you're importing a module purely for its types, TypeScript's `import type` syntax is the better solution:

```typescript
// Preferred: TypeScript erases this entirely
import type { Stats } from 'fs';
```

The bundler already handles `import type` correctly without needing `ignoreModules`. But if a dependency uses a value import for something that ends up being type-only after compilation, `ignoreModules` can work around it.

### A transitive dependency pulls in forbidden modules

When a forbidden module is imported from inside `node_modules` (not your code), the bundler treats it as a warning rather than an error. But if the import comes from your own code through a chain of local helpers, it's treated as an error:

```
workflows.ts → utils/data.ts → some-lib → fs (forbidden)
```

If `some-lib` is a local file (not in `node_modules`), the bundler flags this as an error. Adding `fs` to `ignoreModules` resolves it.

## Examples

### Single module

```typescript
const bundle = await bundleWorkflowCode({
  workflowsPath: './src/workflows.ts',
  ignoreModules: ['fs'],
});
```

### Multiple modules

```typescript
const bundle = await bundleWorkflowCode({
  workflowsPath: './src/workflows.ts',
  ignoreModules: ['fs', 'net', 'dns', 'child_process'],
});
```

### Subpath imports are covered automatically

Adding `'fs'` to `ignoreModules` also covers `'fs/promises'`. You don't need to list subpaths separately:

```typescript
// This covers fs, fs/promises, fs/extra, etc.
ignoreModules: ['fs'];
```

The same applies to scoped packages:

```typescript
// This covers @temporalio/client and @temporalio/client/lib/anything
ignoreModules: ['@temporalio/client'];
```

### CLI usage

```bash
bundle-temporal-workflow build ./src/workflows.ts -i fs -i dns -o bundle.js
```

The `-i` flag can be repeated for multiple modules.

## Gotchas

### The stub throws at runtime, not at build time

If you ignore a module that your workflow actually uses at runtime, the build succeeds but the workflow fails when it hits the stub:

```
Error: Module "fs" was ignored during bundling but was executed at runtime.
This indicates the module is actually used in workflow code.
Move this usage to an Activity or remove it from 'ignoreModules'.
```

This error appears in the Temporal worker logs, not during bundling. If you're not watching worker logs, this can be confusing.

### Ignoring doesn't fix the underlying problem

`ignoreModules` is a workaround, not a solution. If your workflow code genuinely needs file system access, network calls, or other side effects, those operations belong in [Activities](https://docs.temporal.io/activities), not in workflow code. Activities run outside the deterministic sandbox and have full access to Node.js APIs.

### Ignored modules appear in bundle metadata

Ignored modules are recorded in the bundle's `metadata.externals` array. This is useful for auditing what was excluded:

```typescript
const bundle = await bundleWorkflowCode({
  workflowsPath: './src/workflows.ts',
  ignoreModules: ['fs', 'dns'],
});

console.log(bundle.metadata?.externals);
// ['fs', 'dns']
```

### Order of evaluation matters

The bundler checks modules in this order:

1. **Allowed builtins** (`assert`, `url`, `util`) — resolved to Temporal's sandbox stubs
2. **Ignored modules** — replaced with throwing proxy stubs
3. **Type-only imports** — replaced with empty modules
4. **Forbidden modules** — recorded as errors and reported after the build

This means `ignoreModules` takes precedence over the forbidden module check. If a module is both forbidden and ignored, it gets the ignored stub (which throws with a message about being ignored, not about being forbidden).

### Don't ignore modules you actually need

A common mistake is ignoring a module to make the build pass, then wondering why the workflow crashes. Before adding a module to `ignoreModules`, verify that none of your workflow's runtime code paths call into it. The error message at runtime is intentionally loud about this.

### Interaction with tree shaking

Tree shaking (enabled by default) operates after module resolution. Ignored modules are already replaced with stubs before tree shaking runs, so tree shaking has no effect on ignored modules. The stub is always included in the bundle regardless of whether it's "used."

### Interaction with the Bun bundler backend

`ignoreModules` works identically with both the esbuild and Bun.build backends. The same plugin handles module resolution in both cases. The only difference is that the Bun backend doesn't produce dependency chain information in error messages.
