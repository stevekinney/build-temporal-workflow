# Workflow Validation

Validate workflow exports, activity types, and package boundaries at build time to catch errors before deployment.

## Quick Start

```typescript
import { validateWorkflowExports } from 'build-temporal-workflow';

const result = validateWorkflowExports('./src/workflows.ts');

if (!result.valid) {
  for (const error of result.errors) {
    console.error(`${error.exportName}: ${error.message}`);
  }
}
```

## API Reference

### Export Validation

#### `validateWorkflowExports(workflowsPath, options?)`

Validates that a workflow source file exports proper workflow functions.

```typescript
function validateWorkflowExports(
  workflowsPath: string,
  options?: ValidationOptions,
): ExportValidationResult;
```

#### `validateWorkflowExportsFromSource(code, options?)`

Validates workflow exports from a source code string (no file I/O).

```typescript
function validateWorkflowExportsFromSource(
  code: string,
  options?: ValidationOptions,
): ExportValidationResult;
```

#### `ValidationOptions`

| Option               | Type      | Default | Description                                              |
| -------------------- | --------- | ------- | -------------------------------------------------------- |
| `requireReturnTypes` | `boolean` | `false` | Require workflow functions to have explicit return types |
| `requireAsync`       | `boolean` | `true`  | Require all exports to be async functions                |
| `namePattern`        | `RegExp`  | —       | Custom regex for workflow function name validation       |

#### `ExportValidationResult`

| Field      | Type       | Description                                    |
| ---------- | ---------- | ---------------------------------------------- |
| `valid`    | `boolean`  | Whether all exports are valid                  |
| `exports`  | `string[]` | List of export names found                     |
| `errors`   | `array`    | Validation errors with export name and message |
| `warnings` | `array`    | Validation warnings                            |

### Activity Type Validation

#### `validateActivityTypes(activitiesPath)`

Validates that activity function signatures use JSON-serializable types.

```typescript
function validateActivityTypes(activitiesPath: string): TypeValidationResult;
```

```typescript
import { validateActivityTypes } from 'build-temporal-workflow';

const result = validateActivityTypes('./src/activities.ts');

for (const activity of result.activities) {
  if (!activity.valid) {
    console.error(`Activity "${activity.name}":`);
    for (const error of activity.errors) {
      console.error(`  ${error}`);
    }
  }
}
```

#### `validateActivityTypesFromSource(code)`

Validates activity types from a source code string.

#### `TypeValidationResult`

| Field        | Type      | Description                          |
| ------------ | --------- | ------------------------------------ |
| `valid`      | `boolean` | Whether all activity types are valid |
| `activities` | `array`   | Per-activity validation results      |

### Boundary Enforcement

#### `checkWorkflowBoundaries(filePath, boundaries?)`

Checks that a workflow file does not import activity-only packages.

```typescript
function checkWorkflowBoundaries(
  filePath: string,
  boundaries?: PackageBoundaries,
): BoundaryCheckResult;
```

#### `checkActivityBoundaries(filePath, boundaries?)`

Checks that an activity file does not import workflow-only packages.

#### `checkBoundariesFromSource(code, filePath, context, boundaries?)`

Check boundaries from source code without file I/O.

```typescript
function checkBoundariesFromSource(
  code: string,
  filePath: string,
  context: 'workflow' | 'activity',
  boundaries?: PackageBoundaries,
): BoundaryCheckResult;
```

#### `DEFAULT_BOUNDARIES`

Default package boundary rules for Temporal SDK packages:

```typescript
const DEFAULT_BOUNDARIES: PackageBoundaries = {
  workflowOnly: ['@temporalio/workflow'],
  activityOnly: ['@temporalio/activity'],
  shared: ['@temporalio/common'],
};
```

#### `PackageBoundaries`

| Field          | Type       | Description                            |
| -------------- | ---------- | -------------------------------------- |
| `workflowOnly` | `string[]` | Packages only allowed in workflow code |
| `activityOnly` | `string[]` | Packages only allowed in activity code |
| `shared`       | `string[]` | Packages allowed in both               |

#### `BoundaryCheckResult`

| Field        | Type                  | Description                      |
| ------------ | --------------------- | -------------------------------- |
| `valid`      | `boolean`             | Whether no violations were found |
| `violations` | `BoundaryViolation[]` | List of boundary violations      |

## Examples

### Validate all exports are async workflow functions

```typescript
import { validateWorkflowExports } from 'build-temporal-workflow';

const result = validateWorkflowExports('./src/workflows.ts', {
  requireAsync: true,
  requireReturnTypes: true,
  namePattern: /^[a-z][a-zA-Z]+Workflow$/,
});

if (!result.valid) {
  console.error('Workflow validation failed:');
  for (const err of result.errors) {
    console.error(`  ${err.exportName}: ${err.message}`);
  }
  process.exit(1);
}

console.log(`Found ${result.exports.length} valid workflows`);
```

### Enforce boundaries in a monorepo

```typescript
import {
  checkWorkflowBoundaries,
  checkActivityBoundaries,
} from 'build-temporal-workflow';

const customBoundaries = {
  workflowOnly: ['@temporalio/workflow', '@myorg/workflow-utils'],
  activityOnly: ['@temporalio/activity', '@myorg/db-client', '@myorg/http-client'],
  shared: ['@temporalio/common', '@myorg/shared-types'],
};

// Check all workflow files
const workflowResult = checkWorkflowBoundaries(
  './src/workflows/index.ts',
  customBoundaries,
);

if (!workflowResult.valid) {
  for (const violation of workflowResult.violations) {
    console.error(`Workflow imports activity-only package: ${violation.packageName}`);
  }
}

// Check all activity files
const activityResult = checkActivityBoundaries(
  './src/activities/index.ts',
  customBoundaries,
);

if (!activityResult.valid) {
  for (const violation of activityResult.violations) {
    console.error(`Activity imports workflow-only package: ${violation.packageName}`);
  }
}
```

## Related

- [Determinism Checking](./determinism-checking.md) — Check for non-deterministic patterns
- [TypeScript Integration](./typescript-integration.md) — Type checking during builds
- [Testing](./testing.md) — Relaxed validation in test mode
