/**
 * Bun.build backend for Temporal workflow bundling.
 *
 * Uses Bun's native bundler instead of esbuild for faster builds
 * when running under the Bun runtime.
 */

import { existsSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import { createCrossRuntimePlugin, resolveCrossRuntimeConfig } from './cross-runtime';
import { generateEntrypoint, hashEntrypoint } from './entrypoint';
import { WorkflowBundleError } from './errors';
import { createTemporalPlugin } from './esbuild-plugin';
import { loadDeterminismPolicy } from './policy';
import { generateBundleHash, shimEsbuildOutput, validateShimmedOutput } from './shim';
import type { BundleMetadata, InputFlavor, Logger, WorkflowBundle } from './types';
import { getBundlerVersion, getTemporalSdkVersion } from './validate';

/**
 * Check if the Bun.build API is available.
 */
export function isBunBuildAvailable(): boolean {
  return typeof globalThis.Bun?.build === 'function';
}

/**
 * Resolve which bundler backend to use.
 */
export function resolveBundlerBackend(
  preference?: 'esbuild' | 'bun' | 'auto',
  logger?: Logger,
): 'esbuild' | 'bun' {
  const pref = preference ?? 'auto';
  if (pref === 'bun') {
    if (!isBunBuildAvailable()) {
      logger?.warn(
        'bundler: "bun" was requested but Bun.build is not available in this runtime. Falling back to esbuild.',
      );
      return 'esbuild';
    }
    return 'bun';
  }
  if (pref === 'esbuild') {
    return 'esbuild';
  }
  // auto: default to esbuild for maximum plugin compatibility
  return 'esbuild';
}

/**
 * Bundle workflow code using Bun.build.
 */
export async function bunBuildBundle(options: {
  workflowsPath: string;
  workflowInterceptorModules: string[];
  payloadConverterPath: string | undefined;
  failureConverterPath: string | undefined;
  ignoreModules: string[];
  mode: 'development' | 'production';
  sourceMap: 'inline' | 'external' | 'none';
  report: boolean;
  inputFlavor: InputFlavor | undefined;
  denoConfigPath: string | undefined;
  importMapPath: string | undefined;
  logger: Logger;
}): Promise<WorkflowBundle> {
  const startTime = Date.now();

  // Validate workflowsPath exists
  if (!existsSync(options.workflowsPath)) {
    throw new WorkflowBundleError('ENTRYPOINT_NOT_FOUND', {
      details: `Path does not exist: ${options.workflowsPath}`,
    });
  }

  // Generate synthetic entrypoint
  const entrypointOptions = {
    workflowsPath: options.workflowsPath,
    workflowInterceptorModules: options.workflowInterceptorModules,
    payloadConverterPath: options.payloadConverterPath,
    failureConverterPath: options.failureConverterPath,
  };
  const entrypointCode = generateEntrypoint(entrypointOptions);
  const entryHash = hashEntrypoint(entrypointOptions);

  options.logger.debug('Starting Bun.build bundle', { mode: options.mode });

  // Load determinism policy
  const policy = loadDeterminismPolicy();

  // Create the Temporal plugin
  const { plugin: temporalPlugin, state: pluginState } = createTemporalPlugin({
    ignoreModules: options.ignoreModules,
    payloadConverterPath: options.payloadConverterPath,
    failureConverterPath: options.failureConverterPath,
    policy,
  });

  // Create the cross-runtime plugin
  const crossRuntimeConfig = resolveCrossRuntimeConfig(
    options.workflowsPath,
    options.inputFlavor,
    options.denoConfigPath,
    options.importMapPath,
  );
  const crossRuntimePlugin = createCrossRuntimePlugin(
    crossRuntimeConfig,
    options.workflowsPath,
  );

  // Write entrypoint to a temp file since Bun.build doesn't support stdin.
  // Place it next to the workflowsPath so module resolution works correctly.
  const resolveDir = statSync(options.workflowsPath).isDirectory()
    ? options.workflowsPath
    : dirname(options.workflowsPath);
  const tempEntrypoint = join(resolveDir, `__temporal_entrypoint_${Date.now()}__.js`);
  const tempOutdir = join(tmpdir(), `temporal-bun-out-${Date.now()}`);

  try {
    // Write entrypoint
    const fs = await import('node:fs/promises');
    await fs.writeFile(tempEntrypoint, entrypointCode, 'utf-8');

    // Map source map option
    const sourcemap =
      options.sourceMap === 'none'
        ? ('none' as const)
        : options.sourceMap === 'external'
          ? ('external' as const)
          : ('inline' as const);

    // Run Bun.build
    const result = await Bun.build({
      entrypoints: [tempEntrypoint],
      outdir: tempOutdir,
      format: 'cjs',
      target: 'browser',
      minify: false,
      splitting: false,
      sourcemap,
      naming: 'workflow-bundle.[ext]',
      // Bun.build supports esbuild-compatible plugin hooks (onResolve/onLoad)
      // Cast is needed because Bun's PluginBuilder type is a subset of esbuild's PluginBuild
      plugins: [
        crossRuntimePlugin as unknown as import('bun').BunPlugin,
        temporalPlugin as unknown as import('bun').BunPlugin,
      ],
    });

    // Check for build errors
    if (!result.success) {
      const errors = result.logs
        .filter((log: { level: string }) => log.level === 'error')
        .map((log: { message: string }) => log.message)
        .join('\n');
      throw new WorkflowBundleError('BUILD_FAILED', {
        details: errors || 'Bun.build failed with unknown error',
      });
    }

    // Post-build validation: check for dynamic imports
    if (pluginState.dynamicImports.length > 0) {
      const details = pluginState.dynamicImports
        .map((di) => `  - ${di.file}:${di.line}:${di.column}`)
        .join('\n');

      throw new WorkflowBundleError('DYNAMIC_IMPORT', {
        details: `Found ${pluginState.dynamicImports.length} dynamic import(s):\n${details}`,
        hint:
          'Dynamic imports (import()) are not allowed in workflow code because ' +
          'the module resolved at runtime may differ between original execution and replay. ' +
          'Replace with static imports or move dynamic logic to Activities.',
      });
    }

    // Post-build validation: check for forbidden modules
    if (pluginState.foundProblematicModules.size > 0) {
      const modules = Array.from(pluginState.foundProblematicModules.keys());
      const details = Array.from(pluginState.foundProblematicModules.entries())
        .map(([mod, importer]) => `  - '${mod}' (imported from ${importer})`)
        .join('\n');

      throw new WorkflowBundleError('FORBIDDEN_MODULES', {
        modules,
        details,
        // No dependency chain analysis for Bun backend (no metafile equivalent)
      });
    }

    // Read the output
    const bundleOutputPath = join(tempOutdir, 'workflow-bundle.js');
    const mapOutputPath = join(tempOutdir, 'workflow-bundle.js.map');

    if (!existsSync(bundleOutputPath)) {
      // Try reading from result.outputs
      if (result.outputs.length === 0) {
        throw new WorkflowBundleError('BUILD_FAILED', {
          details: 'Bun.build produced no output files',
        });
      }
      // Use the first output
      const output = result.outputs[0]!;
      const code = await output.text();
      return processOutput(code, undefined, entryHash, options, startTime);
    }

    const bundleCode = await Bun.file(bundleOutputPath).text();
    let sourceMapText: string | undefined;
    if (options.sourceMap === 'external' && existsSync(mapOutputPath)) {
      sourceMapText = await Bun.file(mapOutputPath).text();
    }

    // Collect warnings
    const warnings: string[] = [];
    for (const log of result.logs) {
      if (log.level === 'warning') {
        warnings.push(log.message);
        options.logger.warn('Build warning', { text: log.message });
      }
    }

    return processOutput(
      bundleCode,
      sourceMapText,
      entryHash,
      options,
      startTime,
      warnings,
    );
  } catch (error) {
    if (error instanceof WorkflowBundleError) {
      throw error;
    }
    const message = error instanceof Error ? error.message : String(error);
    throw new WorkflowBundleError('BUILD_FAILED', {
      details: message,
    });
  } finally {
    // Clean up temp files
    try {
      const fs = await import('node:fs/promises');
      await fs.rm(tempEntrypoint, { force: true });
      await fs.rm(tempOutdir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  }
}

/**
 * Process build output into a WorkflowBundle.
 */
function processOutput(
  code: string,
  sourceMapText: string | undefined,
  entryHash: string,
  options: {
    mode: 'development' | 'production';
    report: boolean;
    ignoreModules: string[];
    logger: Logger;
  },
  startTime: number,
  warnings: string[] = [],
): WorkflowBundle {
  // Apply shim
  const bundleHash = generateBundleHash(code);
  const shimmedCode = shimEsbuildOutput(code, bundleHash);

  // Validate shimmed output
  const shimValidation = validateShimmedOutput(shimmedCode);
  if (!shimValidation.valid) {
    throw new WorkflowBundleError('BUILD_FAILED', {
      details: `Shim validation failed: ${shimValidation.error}`,
    });
  }

  const buildTime = Date.now() - startTime;
  const sizeKB = (shimmedCode.length / 1024).toFixed(1);
  options.logger.info('Workflow bundle created (Bun.build)', {
    size: `${sizeKB}KB`,
    time: `${buildTime}ms`,
  });

  // Build metadata
  const metadata: BundleMetadata | undefined = options.report
    ? {
        createdAt: new Date().toISOString(),
        mode: options.mode,
        entryHash,
        bundlerVersion: getBundlerVersion(),
        temporalSdkVersion: getTemporalSdkVersion() ?? 'unknown',
        externals: options.ignoreModules.length > 0 ? options.ignoreModules : undefined,
        warnings: warnings.length > 0 ? warnings : undefined,
      }
    : undefined;

  return {
    code: shimmedCode,
    sourceMap: sourceMapText,
    metadata,
  };
}
