# Tree Shaking

Tree shaking eliminates dead code from your workflow bundle's transitive dependencies. It is enabled by default.

## How It Works

When esbuild bundles your workflows, the synthetic entrypoint uses `require()` to import the entire workflow module. esbuild sees every export from your workflow file as used and preserves them all. Tree shaking only removes unreachable code paths within the libraries your workflows depend on.

For example, if your workflow imports a utility library that exports 50 functions but your code only calls 3, tree shaking drops the other 47 (and any code only they reference) from the final bundle.

## Why It's Safe

Workflow exports are never removed because the synthetic entrypoint consumes them with `require(workflowsPath)`. From esbuild's perspective, every export is a live reference. Tree shaking operates only on code paths that are provably unreachable from those exports.

This means:

- All workflow functions remain in the bundle
- All interceptor modules remain in the bundle
- All payload/failure converter modules remain in the bundle
- Only genuinely dead code in third-party dependencies gets dropped

## Configuration

Tree shaking is on by default. To disable it:

```typescript
const bundle = await bundleWorkflowCode({
  workflowsPath: './src/workflows.ts',
  treeShaking: false,
});
```

You can also pass `treeShaking` through `buildOptions`, though the top-level option is preferred:

```typescript
const bundle = await bundleWorkflowCode({
  workflowsPath: './src/workflows.ts',
  buildOptions: { treeShaking: false },
});
```

If both are set, the top-level `treeShaking` option takes precedence because it is applied after `buildOptions` in the esbuild configuration.

## When to Disable

Disable tree shaking if you observe missing modules at runtime. This can happen when a library uses patterns that esbuild cannot statically analyze:

- **Dynamic `require()` calls** inside a dependency (e.g., `require(variable)`)
- **Conditional exports** that depend on runtime checks esbuild cannot evaluate
- **Plugin-based architectures** where a library discovers modules by name at runtime

These cases are rare. If you encounter one, setting `treeShaking: false` restores the previous behavior of including all code from all dependencies.

## Interaction with Other Options

- **`ignoreModules`**: Modules listed in `ignoreModules` are replaced with runtime-throwing stubs before tree shaking runs. Tree shaking does not affect ignored modules.
- **`mode`**: Tree shaking works in both `development` and `production` modes. Production mode additionally enables scope hoisting and dead-code elimination through esbuild's other optimizations.
- **`buildOptions.plugins`**: Custom esbuild plugins run before tree shaking. If a plugin marks modules as external or modifies the module graph, tree shaking respects those changes.
