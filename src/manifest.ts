/**
 * Workflow manifest generation.
 *
 * Generates a manifest of workflow exports that provides stable names
 * and metadata for debugging and validation.
 */

import { createHash } from 'node:crypto';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

import type { WorkflowInfo, WorkflowManifest } from './types';
import { getBundlerVersion, getTemporalSdkVersion } from './validate';

/**
 * Options for manifest generation.
 */
export interface GenerateManifestOptions {
  /**
   * Path to the workflows source file or directory.
   */
  workflowsPath: string;

  /**
   * The generated bundle code.
   */
  bundleCode: string;

  /**
   * Whether to include source hashes for each workflow.
   * Default: true
   */
  includeSourceHashes?: boolean;
}

/**
 * Generate a workflow manifest from the bundle and source.
 *
 * The manifest contains:
 * - Stable workflow names (export names from the source)
 * - Source hashes for change detection
 * - Metadata for debugging
 *
 * @example
 * ```typescript
 * const bundle = await bundleWorkflowCode({ workflowsPath: './workflows.ts' });
 * const manifest = generateManifest({
 *   workflowsPath: './workflows.ts',
 *   bundleCode: bundle.code,
 * });
 *
 * console.log('Workflows:', manifest.workflows.map(w => w.name));
 * ```
 */
export function generateManifest(options: GenerateManifestOptions): WorkflowManifest {
  const { workflowsPath, bundleCode, includeSourceHashes = true } = options;

  // Generate bundle hash
  const bundleHash = createHash('sha256').update(bundleCode).digest('hex').slice(0, 16);

  // Extract workflow exports from the source
  const workflows = extractWorkflowExports(workflowsPath, includeSourceHashes);

  const sdkVersion = getTemporalSdkVersion();

  return {
    version: 1,
    generatedAt: new Date().toISOString(),
    bundleHash,
    workflows,
    ...(sdkVersion ? { sdkVersion } : {}),
    bundlerVersion: getBundlerVersion(),
    sourcePath: workflowsPath,
  };
}

/**
 * Extract workflow exports from the source file(s).
 */
function extractWorkflowExports(
  workflowsPath: string,
  includeSourceHashes: boolean,
): WorkflowInfo[] {
  if (!existsSync(workflowsPath)) {
    return [];
  }

  const stat = statSync(workflowsPath);

  if (stat.isFile()) {
    return extractFromFile(workflowsPath, includeSourceHashes);
  }

  // If directory, look for index file
  const indexPaths = [
    join(workflowsPath, 'index.ts'),
    join(workflowsPath, 'index.js'),
    join(workflowsPath, 'index.mts'),
    join(workflowsPath, 'index.mjs'),
  ];

  for (const indexPath of indexPaths) {
    if (existsSync(indexPath)) {
      return extractFromFile(indexPath, includeSourceHashes);
    }
  }

  return [];
}

/**
 * Extract workflow exports from a single file.
 */
function extractFromFile(filePath: string, includeSourceHashes: boolean): WorkflowInfo[] {
  const content = readFileSync(filePath, 'utf-8');
  const workflows: WorkflowInfo[] = [];

  // Match various export patterns:
  // - export async function workflowName
  // - export function workflowName
  // - export const workflowName = ...
  // - export { workflowName }
  // - export { originalName as workflowName }

  const lines = content.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    const lineNumber = i + 1;

    // Match: export async function name or export function name
    const funcMatch = line.match(/^\s*export\s+(?:async\s+)?function\s+(\w+)/);
    if (funcMatch?.[1]) {
      const name = funcMatch[1];
      const info: WorkflowInfo = {
        name,
        line: lineNumber,
      };

      if (includeSourceHashes) {
        // Extract the function body for hashing
        const funcBody = extractFunctionBody(content, i);
        if (funcBody) {
          info.sourceHash = createHash('sha256')
            .update(funcBody)
            .digest('hex')
            .slice(0, 8);
        }
      }

      // Skip if it looks like a helper function (starts with _)
      if (!name.startsWith('_')) {
        workflows.push(info);
      }
      continue;
    }

    // Match: export const name = ...
    const constMatch = line.match(/^\s*export\s+const\s+(\w+)\s*=/);
    if (constMatch?.[1]) {
      const name = constMatch[1];

      // Skip internal constants
      if (!name.startsWith('_') && !name.match(/^[A-Z_]+$/)) {
        const info: WorkflowInfo = {
          name,
          line: lineNumber,
        };

        if (includeSourceHashes) {
          // For constants, hash the whole line as approximation
          info.sourceHash = createHash('sha256').update(line).digest('hex').slice(0, 8);
        }

        workflows.push(info);
      }
      continue;
    }

    // Match: export { name } or export { name as alias }
    const namedExportMatch = line.match(/^\s*export\s*\{([^}]+)\}/);
    if (namedExportMatch?.[1]) {
      const exports = namedExportMatch[1].split(',').map((e) => e.trim());

      for (const exp of exports) {
        // Handle "name as alias" pattern
        const asMatch = exp.match(/(\w+)\s+as\s+(\w+)/);
        const name = asMatch ? asMatch[2] : exp.trim();

        if (name && !name.startsWith('_')) {
          workflows.push({
            name,
            line: lineNumber,
          });
        }
      }
    }
  }

  return workflows;
}

/**
 * Extract a function body starting from the given line index.
 */
function extractFunctionBody(content: string, startLine: number): string | undefined {
  const lines = content.split('\n');
  let braceCount = 0;
  let started = false;
  const bodyLines: string[] = [];

  for (let i = startLine; i < lines.length; i++) {
    const line = lines[i]!;
    bodyLines.push(line);

    for (const char of line) {
      if (char === '{') {
        braceCount++;
        started = true;
      } else if (char === '}') {
        braceCount--;
      }
    }

    if (started && braceCount === 0) {
      break;
    }
  }

  return bodyLines.length > 0 ? bodyLines.join('\n') : undefined;
}

/**
 * Serialize a manifest to JSON.
 */
export function serializeManifest(manifest: WorkflowManifest): string {
  return JSON.stringify(manifest, null, 2);
}

/**
 * Parse a manifest from JSON.
 */
export function parseManifest(json: string): WorkflowManifest {
  const parsed = JSON.parse(json) as unknown;

  // Validate structure
  if (
    typeof parsed !== 'object' ||
    parsed === null ||
    !('version' in parsed) ||
    typeof (parsed as { version: unknown }).version !== 'number'
  ) {
    throw new Error('Invalid manifest: missing version field');
  }

  const manifest = parsed as { version: number };

  // Validate version
  if (manifest.version !== 1) {
    throw new Error(`Unsupported manifest version: ${manifest.version}`);
  }

  return parsed as WorkflowManifest;
}

/**
 * Compare two manifests to detect changes.
 */
export function compareManifests(
  oldManifest: WorkflowManifest,
  newManifest: WorkflowManifest,
): ManifestDiff {
  const diff: ManifestDiff = {
    bundleChanged: oldManifest.bundleHash !== newManifest.bundleHash,
    workflowsAdded: [],
    workflowsRemoved: [],
    workflowsModified: [],
  };

  const oldWorkflows = new Map(oldManifest.workflows.map((w) => [w.name, w]));
  const newWorkflows = new Map(newManifest.workflows.map((w) => [w.name, w]));

  // Find added and modified
  for (const [name, newInfo] of newWorkflows) {
    const oldInfo = oldWorkflows.get(name);
    if (!oldInfo) {
      diff.workflowsAdded.push(name);
    } else if (newInfo.sourceHash && oldInfo.sourceHash !== newInfo.sourceHash) {
      diff.workflowsModified.push(name);
    }
  }

  // Find removed
  for (const name of oldWorkflows.keys()) {
    if (!newWorkflows.has(name)) {
      diff.workflowsRemoved.push(name);
    }
  }

  return diff;
}

/**
 * Difference between two manifests.
 */
export interface ManifestDiff {
  /**
   * Whether the bundle code changed.
   */
  bundleChanged: boolean;

  /**
   * Workflows that were added.
   */
  workflowsAdded: string[];

  /**
   * Workflows that were removed.
   */
  workflowsRemoved: string[];

  /**
   * Workflows whose source hash changed.
   */
  workflowsModified: string[];
}
