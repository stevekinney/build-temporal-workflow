/**
 * TypeScript type declarations for static file imports.
 *
 * Add this to your tsconfig.json to enable type checking for static imports:
 *
 * ```json
 * {
 *   "compilerOptions": {
 *     "types": ["build-temporal-workflow/types"]
 *   }
 * }
 * ```
 *
 * Or use a triple-slash directive in your source file:
 *
 * ```typescript
 * /// <reference types="build-temporal-workflow/types" />
 * ```
 */

declare module '*.md' {
  const content: string;
  export default content;
}

declare module '*.txt' {
  const content: string;
  export default content;
}

declare module '*.toml' {
  const content: Record<string, unknown>;
  export default content;
}

declare module '*.yaml' {
  const content: unknown;
  export default content;
}

declare module '*.yml' {
  const content: unknown;
  export default content;
}
