/**
 * Source map utilities for path remapping and upload integration.
 *
 * Provides tools for remapping source map paths for deployment,
 * and hooks for uploading source maps to error tracking services
 * like Sentry or Datadog.
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * Options for source map path remapping.
 */
export interface SourceMapRemapOptions {
  /**
   * Prefix to strip from source paths.
   * Example: '/Users/dev/project/' -> strips absolute paths
   */
  stripPrefix?: string;

  /**
   * Prefix to add to source paths.
   * Example: '~/src/' -> makes paths relative to project root
   */
  addPrefix?: string;

  /**
   * Custom path transformation function.
   */
  transform?: (sourcePath: string) => string;
}

/**
 * Configuration for source map upload.
 */
export interface SourceMapUploadOptions {
  /**
   * Upload handler function.
   * Receives the source map content and metadata.
   */
  handler: (data: SourceMapUploadData) => Promise<void>;

  /**
   * Release/version identifier.
   */
  release?: string;

  /**
   * Environment name.
   */
  environment?: string;
}

/**
 * Data passed to the source map upload handler.
 */
export interface SourceMapUploadData {
  /**
   * The source map JSON content.
   */
  sourceMap: string;

  /**
   * The bundle code.
   */
  bundleCode: string;

  /**
   * Bundle file name.
   */
  bundleName: string;

  /**
   * Release/version identifier.
   */
  release?: string;

  /**
   * Environment name.
   */
  environment?: string;
}

/**
 * Remap paths in a source map.
 *
 * @example
 * ```typescript
 * import { remapSourceMapPaths } from 'bundle-temporal-workflow';
 *
 * const remapped = remapSourceMapPaths(sourceMapJson, {
 *   stripPrefix: '/Users/dev/project/',
 *   addPrefix: '~/',
 * });
 * ```
 */
export function remapSourceMapPaths(
  sourceMapJson: string,
  options: SourceMapRemapOptions,
): string {
  interface SourceMap {
    sources: string[];
    [key: string]: unknown;
  }

  const sourceMap = JSON.parse(sourceMapJson) as SourceMap;

  sourceMap.sources = sourceMap.sources.map((source) => {
    let remapped = source;

    if (options.stripPrefix && remapped.startsWith(options.stripPrefix)) {
      remapped = remapped.slice(options.stripPrefix.length);
    }

    if (options.addPrefix) {
      remapped = options.addPrefix + remapped;
    }

    if (options.transform) {
      remapped = options.transform(remapped);
    }

    return remapped;
  });

  return JSON.stringify(sourceMap);
}

/**
 * Remap source map paths in a file and write the result.
 */
export function remapSourceMapFile(
  sourceMapPath: string,
  options: SourceMapRemapOptions,
  outputPath?: string,
): void {
  const content = readFileSync(resolve(sourceMapPath), 'utf-8');
  const remapped = remapSourceMapPaths(content, options);
  writeFileSync(resolve(outputPath ?? sourceMapPath), remapped);
}

/**
 * Upload a source map using the configured handler.
 *
 * @example
 * ```typescript
 * import { uploadSourceMap } from 'bundle-temporal-workflow';
 *
 * await uploadSourceMap(bundle, {
 *   handler: async (data) => {
 *     // Upload to Sentry, Datadog, etc.
 *     await fetch('https://sentry.io/api/sourcemaps/', {
 *       method: 'POST',
 *       body: JSON.stringify(data),
 *     });
 *   },
 *   release: '1.0.0',
 *   environment: 'production',
 * });
 * ```
 */
export async function uploadSourceMap(
  bundle: { code: string; sourceMap?: string },
  options: SourceMapUploadOptions,
): Promise<void> {
  if (!bundle.sourceMap) {
    throw new Error('Bundle does not have a source map to upload');
  }

  await options.handler({
    sourceMap: bundle.sourceMap,
    bundleCode: bundle.code,
    bundleName: 'workflow-bundle.js',
    ...(options.release !== undefined && { release: options.release }),
    ...(options.environment !== undefined && { environment: options.environment }),
  });
}
