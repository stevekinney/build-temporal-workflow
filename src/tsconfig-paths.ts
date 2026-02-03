/**
 * TypeScript path alias support for workflow bundling.
 *
 * Parses tsconfig.json paths configuration and creates an esbuild plugin
 * that resolves import aliases like `@/utils` to their actual paths.
 *
 * @module
 */

import { existsSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

import type * as esbuild from 'esbuild';

/**
 * Parsed tsconfig paths configuration.
 */
export interface TsconfigPaths {
  /**
   * Base URL for resolving non-relative imports.
   */
  baseUrl?: string;

  /**
   * Path mappings from tsconfig.json compilerOptions.paths.
   * Keys are patterns like "@/*", values are arrays of replacement patterns.
   */
  paths?: Record<string, string[]>;
}

/**
 * Options for the tsconfig paths plugin.
 */
export interface TsconfigPathsPluginOptions {
  /**
   * Path to tsconfig.json file.
   * If not provided, will search for tsconfig.json near the workflowsPath.
   */
  tsconfigPath?: string;

  /**
   * Base directory for resolving paths.
   * Defaults to the directory containing tsconfig.json.
   */
  baseDir?: string;
}

/**
 * Find tsconfig.json by searching the given directory and up to 5 parent directories.
 *
 * @param startPath - Starting path (file or directory) to search from
 * @returns Path to tsconfig.json if found, undefined otherwise
 */
export function findTsconfig(startPath: string): string | undefined {
  const startDir = statSync(startPath).isDirectory() ? startPath : dirname(startPath);

  let currentDir = resolve(startDir);

  for (let i = 0; i < 6; i++) {
    const candidate = join(currentDir, 'tsconfig.json');
    if (existsSync(candidate)) {
      return candidate;
    }

    const parentDir = dirname(currentDir);
    if (parentDir === currentDir) break;
    currentDir = parentDir;
  }

  return undefined;
}

/**
 * Parse tsconfig.json and extract paths configuration.
 *
 * Handles:
 * - Direct tsconfig.json files
 * - The "extends" field for inheritance
 * - Comments in JSONC format
 *
 * @param tsconfigPath - Path to tsconfig.json
 * @returns Parsed paths configuration
 */
export function parseTsconfigPaths(tsconfigPath: string): TsconfigPaths {
  if (!existsSync(tsconfigPath)) {
    throw new Error(`tsconfig.json not found: ${tsconfigPath}`);
  }

  const content = readFileSync(tsconfigPath, 'utf-8');

  // Handle JSONC (JSON with comments)
  const jsonContent = content
    .replace(/\/\/.*$/gm, '') // Remove single-line comments
    .replace(/\/\*[\s\S]*?\*\//g, '') // Remove multi-line comments
    .replace(/,(\s*[}\]])/g, '$1'); // Remove trailing commas

  interface TsconfigJson {
    extends?: string;
    compilerOptions?: {
      baseUrl?: string;
      paths?: Record<string, string[]>;
    };
  }

  let config: TsconfigJson;

  try {
    config = JSON.parse(jsonContent) as TsconfigJson;
  } catch (error) {
    throw new Error(
      `Failed to parse tsconfig.json at ${tsconfigPath}: ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  const result: TsconfigPaths = {};
  const tsconfigDir = dirname(tsconfigPath);

  // Handle extends
  if (config.extends) {
    const extendsPath = resolve(tsconfigDir, config.extends);
    // Check if it's a relative path that needs .json extension
    const resolvedExtendsPath = existsSync(extendsPath)
      ? extendsPath
      : existsSync(extendsPath + '.json')
        ? extendsPath + '.json'
        : extendsPath;

    if (existsSync(resolvedExtendsPath)) {
      const parentConfig = parseTsconfigPaths(resolvedExtendsPath);
      if (parentConfig.baseUrl) {
        // Parent baseUrl is relative to parent tsconfig location
        result.baseUrl = parentConfig.baseUrl;
      }
      if (parentConfig.paths) {
        result.paths = { ...parentConfig.paths };
      }
    }
  }

  // Override with local config
  if (config.compilerOptions?.baseUrl) {
    result.baseUrl = resolve(tsconfigDir, config.compilerOptions.baseUrl);
  }

  if (config.compilerOptions?.paths) {
    result.paths = {
      ...result.paths,
      ...config.compilerOptions.paths,
    };
  }

  return result;
}

/**
 * Convert a tsconfig path pattern to a regex.
 *
 * Handles patterns like:
 * - "@/*" -> matches "@/anything"
 * - "utils" -> matches "utils" exactly
 */
function patternToRegex(pattern: string): RegExp {
  if (pattern.endsWith('/*')) {
    // Wildcard pattern: @/* matches @/anything
    const prefix = pattern.slice(0, -2);
    const escaped = prefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return new RegExp(`^${escaped}(?:/.*)?$`);
  } else if (pattern.includes('*')) {
    // Other wildcard patterns
    const escaped = pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const withWildcard = escaped.replace(/\\\*/g, '.*');
    return new RegExp(`^${withWildcard}$`);
  } else {
    // Exact match
    const escaped = pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return new RegExp(`^${escaped}$`);
  }
}

/**
 * Resolve an import path using tsconfig paths configuration.
 *
 * @param importPath - The import path to resolve (e.g., "@/utils/helper")
 * @param paths - The tsconfig paths configuration
 * @param baseUrl - The base URL for resolution
 * @returns Array of possible resolved paths, or empty array if no match
 */
export function resolvePathAlias(
  importPath: string,
  paths: Record<string, string[]>,
  baseUrl: string,
): string[] {
  for (const [pattern, replacements] of Object.entries(paths)) {
    const regex = patternToRegex(pattern);

    if (regex.test(importPath)) {
      const results: string[] = [];

      for (const replacement of replacements) {
        let resolved: string;

        if (pattern.endsWith('/*') && replacement.endsWith('/*')) {
          // Wildcard replacement: @/* -> ./src/*
          const prefix = pattern.slice(0, -2);
          const suffix = importPath.slice(prefix.length);
          const replacementBase = replacement.slice(0, -2);
          resolved = resolve(baseUrl, replacementBase + suffix);
        } else if (pattern.includes('*') && replacement.includes('*')) {
          // Other wildcard patterns
          const wildcardMatch = importPath.match(patternToRegex(pattern));
          if (wildcardMatch) {
            // Simple wildcard substitution
            const wildcardPart = importPath.replace(pattern.replace('*', ''), '');
            resolved = resolve(baseUrl, replacement.replace('*', wildcardPart));
          } else {
            resolved = resolve(baseUrl, replacement);
          }
        } else {
          // Exact match
          resolved = resolve(baseUrl, replacement);
        }

        results.push(resolved);
      }

      return results;
    }
  }

  return [];
}

/**
 * Create an esbuild plugin that resolves TypeScript path aliases.
 *
 * The plugin reads tsconfig.json paths configuration and resolves
 * imports like `@/utils` to their actual paths.
 *
 * @example
 * ```typescript
 * import { createTsconfigPathsPlugin } from 'build-temporal-workflow';
 *
 * const plugin = createTsconfigPathsPlugin({
 *   tsconfigPath: './tsconfig.json',
 * });
 *
 * await bundleWorkflowCode({
 *   workflowsPath: './src/workflows.ts',
 *   buildOptions: {
 *     plugins: [plugin],
 *   },
 * });
 * ```
 */
export function createTsconfigPathsPlugin(
  options: TsconfigPathsPluginOptions = {},
): esbuild.Plugin {
  return {
    name: 'temporal-tsconfig-paths',
    setup(build) {
      // Lazily load config on first resolve
      let config: TsconfigPaths | null = null;
      let configLoaded = false;

      build.onResolve({ filter: /.*/ }, (args) => {
        // Skip relative and absolute paths
        if (
          args.path.startsWith('.') ||
          args.path.startsWith('/') ||
          args.path.startsWith('node:')
        ) {
          return null;
        }

        // Skip if this is from node_modules (avoid infinite loops)
        if (args.resolveDir.includes('node_modules')) {
          return null;
        }

        // Load config lazily
        if (!configLoaded) {
          configLoaded = true;
          const tsconfigPath = options.tsconfigPath ?? findTsconfig(args.resolveDir);

          if (tsconfigPath) {
            try {
              config = parseTsconfigPaths(tsconfigPath);
              // If baseUrl isn't set, use the tsconfig directory
              if (!config.baseUrl) {
                config.baseUrl = options.baseDir ?? dirname(tsconfigPath);
              }
            } catch {
              // Ignore errors, just don't use paths
              config = null;
            }
          }
        }

        // No config or no paths
        if (!config?.paths || !config.baseUrl) {
          return null;
        }

        // Try to resolve the import
        const resolved = resolvePathAlias(args.path, config.paths, config.baseUrl);

        if (resolved.length === 0) {
          return null;
        }

        // Try each resolved path until one exists
        for (const path of resolved) {
          // Try exact path
          if (existsSync(path)) {
            const stat = statSync(path);
            if (stat.isFile()) {
              return { path, namespace: 'file' };
            }
            // If it's a directory, try index files
            if (stat.isDirectory()) {
              for (const indexFile of [
                'index.ts',
                'index.tsx',
                'index.js',
                'index.jsx',
              ]) {
                const indexPath = join(path, indexFile);
                if (existsSync(indexPath)) {
                  return { path: indexPath, namespace: 'file' };
                }
              }
            }
          }

          // Try with extensions
          for (const ext of ['.ts', '.tsx', '.js', '.jsx']) {
            const pathWithExt = path + ext;
            if (existsSync(pathWithExt)) {
              return { path: pathWithExt, namespace: 'file' };
            }
          }
        }

        // Let esbuild handle it
        return null;
      });
    },
  };
}

export default createTsconfigPathsPlugin;
