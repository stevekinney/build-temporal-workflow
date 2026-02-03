/**
 * Deep content hashing for all bundle input files.
 *
 * Computes a composite hash of all source files that contribute to a bundle,
 * not just the entrypoint. This provides reliable cache invalidation even when
 * transitive dependencies change.
 */

import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';

import type { ContentHashOptions } from './types';

const DEFAULT_EXTENSIONS = ['.ts', '.tsx', '.js', '.jsx', '.mts', '.cts', '.mjs', '.cjs'];

/**
 * Compute a composite hash of all source files under a given path.
 *
 * The hash is computed by:
 * 1. Recursively finding all source files matching the configured extensions
 * 2. Sorting file paths for determinism
 * 3. Hashing each file's content and combining into a single hash
 *
 * @param workflowsPath - Path to the workflow file or directory
 * @param options - Hashing configuration
 * @returns Hex-encoded hash string
 */
export function computeBundleContentHash(
  workflowsPath: string,
  options: ContentHashOptions = {},
): string {
  const resolvedPath = resolve(workflowsPath);
  const extensions = options.extensions ?? DEFAULT_EXTENSIONS;
  const includeNodeModules = options.includeNodeModules ?? false;

  const files = collectSourceFiles(resolvedPath, extensions, includeNodeModules);
  files.sort();

  const hasher = new Bun.CryptoHasher('sha256');

  for (const filePath of files) {
    // Include the relative path in the hash so renames are detected
    hasher.update(filePath);
    hasher.update(readFileSync(filePath));
  }

  return hasher.digest('hex');
}

/**
 * Recursively collect source files from a path.
 */
function collectSourceFiles(
  rootPath: string,
  extensions: string[],
  includeNodeModules: boolean,
): string[] {
  if (!existsSync(rootPath)) {
    return [];
  }

  const stat = statSync(rootPath);

  if (stat.isFile()) {
    const ext = rootPath.slice(rootPath.lastIndexOf('.'));
    if (extensions.includes(ext)) {
      return [rootPath];
    }
    return [];
  }

  if (!stat.isDirectory()) {
    return [];
  }

  const results: string[] = [];
  const entries = readdirSync(rootPath, { withFileTypes: true });

  for (const entry of entries) {
    // Skip node_modules unless explicitly included
    if (!includeNodeModules && entry.name === 'node_modules') {
      continue;
    }

    // Skip hidden directories
    if (entry.name.startsWith('.')) {
      continue;
    }

    const fullPath = join(rootPath, entry.name);

    if (entry.isDirectory()) {
      results.push(...collectSourceFiles(fullPath, extensions, includeNodeModules));
    } else if (entry.isFile()) {
      const ext = entry.name.slice(entry.name.lastIndexOf('.'));
      if (extensions.includes(ext)) {
        results.push(fullPath);
      }
    }
  }

  return results;
}

/**
 * Compute a quick hash of a single file's content.
 */
export function hashFileContent(filePath: string): string {
  const content = readFileSync(filePath);
  return new Bun.CryptoHasher('sha256').update(content).digest('hex');
}
