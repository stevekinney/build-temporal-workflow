/**
 * Activity code bundler.
 *
 * Bundles activity implementations using the same infrastructure as workflow
 * bundling, but with different constraints — activities can use non-deterministic
 * code, network calls, file system access, etc.
 */

import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import * as esbuild from 'esbuild';

import { WorkflowBundleError } from './errors';
import type { ActivityBundle, ActivityBundleOptions, Logger } from './types';

const nullLogger: Logger = {
  trace() {},
  debug() {},
  info() {},
  warn() {},
  error() {},
};

/**
 * Bundle activity code for deployment alongside workflow bundles.
 *
 * Unlike workflow bundles, activity bundles:
 * - Can use any Node.js module (no determinism restrictions)
 * - Support ESM output format
 * - Allow minification and tree-shaking
 * - Can externalize dependencies
 *
 * @example
 * ```typescript
 * import { bundleActivityCode } from 'bundle-temporal-workflow';
 *
 * const activityBundle = await bundleActivityCode({
 *   activitiesPath: './src/activities.ts',
 *   format: 'esm',
 *   external: ['pg', 'redis'],
 * });
 *
 * console.log('Activities:', activityBundle.activityNames);
 * ```
 */
export async function bundleActivityCode(
  options: ActivityBundleOptions,
): Promise<ActivityBundle> {
  const logger = options.logger ?? nullLogger;
  const activitiesPath = resolve(options.activitiesPath);

  if (!existsSync(activitiesPath)) {
    throw new WorkflowBundleError('ENTRYPOINT_NOT_FOUND', {
      details: `Activities path does not exist: ${activitiesPath}`,
    });
  }

  logger.debug('Bundling activities', { activitiesPath });

  const format = options.format ?? 'esm';
  const external = options.external ?? [];

  const result = await esbuild.build({
    entryPoints: [activitiesPath],
    bundle: true,
    format,
    platform: 'node',
    target: 'es2020',
    write: false,
    metafile: true,
    minify: options.minify ?? false,
    treeShaking: true,
    keepNames: true,
    external,
    sourcemap: true,
    outfile: 'activities.js',
  });

  if (!result.outputFiles || result.outputFiles.length === 0) {
    throw new WorkflowBundleError('BUILD_FAILED', {
      details: 'esbuild produced no output files for activity bundle',
    });
  }

  const bundleFile = result.outputFiles.find((f) => f.path.endsWith('.js'));
  const mapFile = result.outputFiles.find((f) => f.path.endsWith('.map'));

  if (!bundleFile) {
    throw new WorkflowBundleError('BUILD_FAILED', {
      details: 'esbuild produced no JavaScript output for activity bundle',
    });
  }

  // Extract activity names from source
  const activityNames = extractActivityExports(activitiesPath);

  const sizeKB = (bundleFile.text.length / 1024).toFixed(1);
  logger.info('Activity bundle created', {
    size: `${sizeKB}KB`,
    activities: activityNames.length,
  });

  return {
    code: bundleFile.text,
    ...(mapFile?.text !== undefined && { sourceMap: mapFile.text }),
    activityNames,
  };
}

/**
 * Extract exported function names from an activity source file.
 */
function extractActivityExports(filePath: string): string[] {
  const content = readFileSync(filePath, 'utf-8');
  const names: string[] = [];

  // Match: export async function name(
  const asyncFuncPattern = /export\s+(?:async\s+)?function\s+(\w+)\s*\(/g;
  let match;
  while ((match = asyncFuncPattern.exec(content)) !== null) {
    names.push(match[1]!);
  }

  // Match: export const name = async (
  const constPattern =
    /export\s+const\s+(\w+)\s*=\s*(?:async\s+)?(?:\([^)]*\)|[a-zA-Z_$]\w*)\s*(?:=>|{)/g;
  while ((match = constPattern.exec(content)) !== null) {
    names.push(match[1]!);
  }

  return [...new Set(names)];
}
