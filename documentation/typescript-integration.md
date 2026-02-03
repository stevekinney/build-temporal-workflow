# TypeScript Integration

Type checking workflows during the build, generating declaration files, and resolving path aliases.

## Quick Start

```typescript
import { typeCheckWorkflows } from 'build-temporal-workflow';

const result = await typeCheckWorkflows('./src/workflows.ts', {
  strict: true,
  workflowRules: true,
});

if (result.diagnostics.length > 0) {
  for (const diag of result.diagnostics) {
    console.error(`${diag.file}:${diag.line} - ${diag.message}`);
  }
}
```

## API Reference

### Type Checking

#### `typeCheckWorkflows(workflowsPath, options?)`

Run TypeScript type checking against workflow source files during the build process.

```typescript
function typeCheckWorkflows(
  workflowsPath: string,
  options?: TypeCheckOptions,
): Promise<TypeCheckResult>;
```

#### `TypeCheckOptions`

| Option          | Type      | Default | Description                          |
| --------------- | --------- | ------- | ------------------------------------ |
| `enabled`       | `boolean` | `false` | Whether to enable type checking      |
| `strict`        | `boolean` | `false` | Use TypeScript strict mode           |
| `workflowRules` | `boolean` | `false` | Enforce workflow-specific type rules |

When `workflowRules` is enabled, additional checks are applied:

- Workflow functions must be `async`
- Parameters and return types must be serializable
- No direct references to non-deterministic globals

#### `TypeCheckResult`

| Field         | Type                    | Description                      |
| ------------- | ----------------------- | -------------------------------- |
| `success`     | `boolean`               | Whether type checking passed     |
| `diagnostics` | `TypeCheckDiagnostic[]` | List of type errors and warnings |

#### `TypeCheckDiagnostic`

| Field      | Type     | Description                |
| ---------- | -------- | -------------------------- |
| `file`     | `string` | Source file path           |
| `line`     | `number` | Line number                |
| `column`   | `number` | Column number              |
| `message`  | `string` | Diagnostic message         |
| `severity` | `string` | `'error'` or `'warning'`   |
| `code`     | `number` | TypeScript diagnostic code |

### Declaration Generation

#### `generateWorkflowDeclarations(workflowsPath, outputPath)`

Generate TypeScript `.d.ts` declaration files for workflow exports. This enables type-safe workflow client usage.

```typescript
function generateWorkflowDeclarations(workflowsPath: string, outputPath: string): void;
```

```typescript
import { generateWorkflowDeclarations } from 'build-temporal-workflow';

generateWorkflowDeclarations('./src/workflows.ts', './dist/workflows.d.ts');
```

#### `generateDeclarationContent(code, sourcePath?)`

Generate declaration content from source code without file I/O.

```typescript
function generateDeclarationContent(code: string, sourcePath?: string): string;
```

### Path Alias Resolution

#### `tsconfigPath` option

Enable path alias resolution in `BundleOptions`:

```typescript
const bundle = await bundleWorkflowCode({
  workflowsPath: './src/workflows.ts',
  tsconfigPath: true, // Auto-detect tsconfig.json
});

// Or specify explicitly
const bundle = await bundleWorkflowCode({
  workflowsPath: './src/workflows.ts',
  tsconfigPath: './tsconfig.json',
});
```

#### `createTsconfigPathsPlugin(options)`

Create an esbuild plugin for resolving TypeScript path aliases.

```typescript
import { createTsconfigPathsPlugin } from 'build-temporal-workflow';

const plugin = createTsconfigPathsPlugin({
  tsconfigPath: './tsconfig.json',
});
```

#### `findTsconfig(startDir)`

Search for `tsconfig.json` starting from a directory, walking up the tree.

#### `parseTsconfigPaths(tsconfigPath)`

Parse a tsconfig.json and extract `baseUrl` and `paths` configuration.

#### `resolvePathAlias(specifier, paths)`

Resolve a single import specifier against parsed tsconfig path mappings.

## Examples

### Type-safe workflow client generation

```typescript
import {
  bundleWorkflowCode,
  generateWorkflowDeclarations,
} from 'build-temporal-workflow';

// Build the bundle
const bundle = await bundleWorkflowCode({
  workflowsPath: './src/workflows.ts',
  mode: 'production',
});

// Generate declarations for the client
generateWorkflowDeclarations('./src/workflows.ts', './dist/workflows.d.ts');
```

The generated `.d.ts` file can be imported by your workflow client code for type-safe `startWorkflow` calls.

### Path aliases with custom tsconfig

```typescript
// tsconfig.json
{
  "compilerOptions": {
    "baseUrl": ".",
    "paths": {
      "@workflows/*": ["./src/workflows/*"],
      "@utils/*": ["./src/utils/*"],
      "@shared/*": ["./src/shared/*"]
    }
  }
}
```

```typescript
// src/workflows/order.ts
import { validate } from '@utils/validation';
import { OrderStatus } from '@shared/types';

export async function orderWorkflow(orderId: string): Promise<OrderStatus> {
  // ...
}
```

```typescript
// Bundle resolves @utils/* and @shared/* automatically
const bundle = await bundleWorkflowCode({
  workflowsPath: './src/workflows/order.ts',
  tsconfigPath: true,
});
```

### CI type checking

```typescript
import { typeCheckWorkflows, bundleWorkflowCode } from 'build-temporal-workflow';

// Type check first
const typeResult = await typeCheckWorkflows('./src/workflows.ts', {
  strict: true,
  workflowRules: true,
});

if (!typeResult.success) {
  console.error('Type errors found:');
  for (const diag of typeResult.diagnostics) {
    console.error(`  ${diag.file}:${diag.line} - ${diag.message}`);
  }
  process.exit(1);
}

// Then build
const bundle = await bundleWorkflowCode({
  workflowsPath: './src/workflows.ts',
  mode: 'production',
});
```

## Related

- [Workflow Validation](./workflow-validation.md) — Validate exports and boundaries
- [Plugin System](./plugin-system.md) — Create custom type checking plugins
- [CI/CD Integration](./ci-cd-integration.md) — Run type checks in CI
