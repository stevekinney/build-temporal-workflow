/**
 * Dependency chain analysis using esbuild's metafile.
 *
 * Provides utilities to find the shortest path from the entrypoint
 * to a problematic module, enabling better error messages.
 */

import type * as esbuild from 'esbuild';

/**
 * Build a dependency graph from esbuild's metafile.
 *
 * Returns a map where keys are module paths and values are arrays
 * of modules that import that module (reverse edges for BFS from target).
 */
export function buildDependencyGraph(metafile: esbuild.Metafile): Map<string, string[]> {
  const graph = new Map<string, string[]>();

  // Initialize all nodes
  for (const inputPath of Object.keys(metafile.inputs)) {
    if (!graph.has(inputPath)) {
      graph.set(inputPath, []);
    }
  }

  // Build reverse edges (who imports this module?)
  for (const [inputPath, input] of Object.entries(metafile.inputs)) {
    for (const imp of input.imports) {
      // imp.path is the resolved path of the imported module
      const importedPath = imp.path;

      // Skip external modules (they won't be in inputs)
      if (!metafile.inputs[importedPath]) {
        // For external/virtual modules, still track them
        if (!graph.has(importedPath)) {
          graph.set(importedPath, []);
        }
      }

      // Add reverse edge: importedPath is imported by inputPath
      const importers = graph.get(importedPath) ?? [];
      if (!importers.includes(inputPath)) {
        importers.push(inputPath);
      }
      graph.set(importedPath, importers);
    }
  }

  return graph;
}

/**
 * Find the entrypoint in the metafile.
 *
 * The entrypoint is typically the module with no importers,
 * or explicitly marked as an entry point.
 */
export function findEntrypoint(metafile: esbuild.Metafile): string | undefined {
  // Check for explicit entry points first
  for (const output of Object.values(metafile.outputs)) {
    if (output.entryPoint) {
      return output.entryPoint;
    }
  }

  // Fallback: find module with no importers
  const allImported = new Set<string>();

  for (const [, input] of Object.entries(metafile.inputs)) {
    for (const imp of input.imports) {
      allImported.add(imp.path);
    }
  }

  // Entry point is the one not imported by anyone
  for (const inputPath of Object.keys(metafile.inputs)) {
    if (!allImported.has(inputPath)) {
      return inputPath;
    }
  }

  return undefined;
}

/**
 * Find the shortest dependency chain from entrypoint to a target module.
 *
 * Uses BFS to find the shortest path. Returns the chain as an array
 * of module paths from entrypoint to target.
 *
 * @param metafile - esbuild's metafile output
 * @param targetModule - The module to find (can be a partial match)
 * @returns Array of module paths, or undefined if no path found
 */
export function findDependencyChain(
  metafile: esbuild.Metafile,
  targetModule: string,
): string[] | undefined {
  const entrypoint = findEntrypoint(metafile);
  if (!entrypoint) {
    return undefined;
  }

  // Build forward graph (who does this module import?)
  const forwardGraph = new Map<string, string[]>();

  for (const [inputPath, input] of Object.entries(metafile.inputs)) {
    const imports = input.imports.map((imp) => imp.path);
    forwardGraph.set(inputPath, imports);
  }

  // Find the actual target path (may need fuzzy matching)
  const actualTarget = findTargetModule(metafile, targetModule);
  if (!actualTarget) {
    return undefined;
  }

  // BFS from entrypoint to target
  const visited = new Set<string>();
  const queue: Array<{ path: string; chain: string[] }> = [
    { path: entrypoint, chain: [entrypoint] },
  ];

  while (queue.length > 0) {
    const current = queue.shift();
    if (!current) break;

    if (current.path === actualTarget) {
      return current.chain;
    }

    if (visited.has(current.path)) {
      continue;
    }
    visited.add(current.path);

    const imports = forwardGraph.get(current.path) ?? [];
    for (const imp of imports) {
      if (!visited.has(imp)) {
        queue.push({
          path: imp,
          chain: [...current.chain, imp],
        });
      }
    }
  }

  return undefined;
}

/**
 * Find the actual module path that matches a target.
 *
 * Handles cases where the target is:
 * - An exact match
 * - A namespace path (e.g., "temporal-forbidden:fs")
 * - A partial path match
 */
function findTargetModule(
  metafile: esbuild.Metafile,
  targetModule: string,
): string | undefined {
  // Check all inputs
  for (const inputPath of Object.keys(metafile.inputs)) {
    if (inputPath === targetModule) {
      return inputPath;
    }
    // Check if the input path ends with the target
    if (inputPath.endsWith(`/${targetModule}`)) {
      return inputPath;
    }
    // Check for node_modules match
    if (inputPath.includes(`node_modules/${targetModule}`)) {
      return inputPath;
    }
  }

  // Check imports that might be external/virtual
  for (const input of Object.values(metafile.inputs)) {
    for (const imp of input.imports) {
      if (imp.path === targetModule) {
        return imp.path;
      }
      // Check namespace paths (e.g., "temporal-forbidden:fs")
      if (imp.path.includes(`:${targetModule}`)) {
        return imp.path;
      }
      if (imp.path.endsWith(`/${targetModule}`)) {
        return imp.path;
      }
    }
  }

  return undefined;
}

/**
 * Find dependency chains for multiple target modules.
 *
 * @param metafile - esbuild's metafile output
 * @param targetModules - Map of module name -> importer path
 * @returns Map of module name -> dependency chain (or undefined if not found)
 */
export function findAllDependencyChains(
  metafile: esbuild.Metafile,
  targetModules: Map<string, string>,
): Map<string, string[] | undefined> {
  const results = new Map<string, string[] | undefined>();

  for (const [moduleName] of targetModules) {
    const chain = findDependencyChain(metafile, moduleName);
    results.set(moduleName, chain);
  }

  return results;
}

/**
 * Format a dependency chain for display.
 *
 * Simplifies paths for readability:
 * - Removes common prefixes
 * - Shortens node_modules paths
 * - Adds arrows between steps
 */
export function formatDependencyChain(chain: string[]): string[] {
  return chain.map((path) => {
    // Simplify node_modules paths
    const nodeModulesMatch = path.match(/node_modules\/(.+)/);
    if (nodeModulesMatch) {
      return nodeModulesMatch[1] ?? path;
    }

    // Simplify namespace paths (e.g., "temporal-forbidden:fs" -> "fs (forbidden)")
    const namespaceMatch = path.match(/^temporal-(forbidden|ignored):(.+)$/);
    if (namespaceMatch) {
      const [, type, moduleName] = namespaceMatch;
      return `${moduleName} (${type})`;
    }

    // Remove ./ prefix if present
    if (path.startsWith('./')) {
      return path.slice(2);
    }

    return path;
  });
}

/**
 * Get a human-readable summary of the dependency chain.
 */
export function summarizeDependencyChain(chain: string[]): string {
  const formatted = formatDependencyChain(chain);
  return formatted.join(' → ');
}
