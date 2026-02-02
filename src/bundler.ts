/**
 * Main WorkflowCodeBundler class.
 *
 * Uses esbuild to bundle Temporal workflow code, replacing the Webpack-based
 * bundler in @temporalio/worker for faster builds.
 */

import { existsSync, statSync } from 'node:fs';
import { dirname, join, parse } from 'node:path';

import * as esbuild from 'esbuild';

import { createCrossRuntimePlugin, resolveCrossRuntimeConfig } from './cross-runtime';
import { findAllDependencyChains, formatDependencyChain } from './dependency-chain';
import { generateEntrypoint, hashEntrypoint } from './entrypoint';
import { WorkflowBundleError } from './errors';
import { createTemporalPlugin } from './esbuild-plugin';
import { loadDeterminismPolicy } from './policy';
import { generateBundleHash, shimEsbuildOutput, validateShimmedOutput } from './shim';
import type {
  BundleMetadata,
  BundleOptions,
  BundlerPlugin,
  InputFlavor,
  Logger,
  WorkflowBundle,
} from './types';
import { getBundlerVersion, getTemporalSdkVersion } from './validate';

/**
 * Default logger that does nothing.
 */
const nullLogger: Logger = {
  trace() {},
  debug() {},
  info() {},
  warn() {},
  error() {},
};

/**
 * Console-based logger for development.
 */
export function createConsoleLogger(): Logger {
  return {
    trace(message, meta) {
      console.log(`[TRACE] ${message}`, meta ?? '');
    },
    debug(message, meta) {
      console.log(`[DEBUG] ${message}`, meta ?? '');
    },
    info(message, meta) {
      console.log(`[INFO] ${message}`, meta ?? '');
    },
    warn(message, meta) {
      console.warn(`[WARN] ${message}`, meta ?? '');
    },
    error(message, meta) {
      console.error(`[ERROR] ${message}`, meta ?? '');
    },
  };
}

/**
 * esbuild options that are ENFORCED and cannot be overridden.
 * These preserve workflow type inference and determinism.
 */
const ENFORCED_OPTIONS: Partial<esbuild.BuildOptions> = {
  bundle: true,
  format: 'cjs',
  platform: 'node',
  target: 'es2020',
  write: false, // Output to memory

  // SAFETY: Prevent workflow type name mangling
  minify: false,
  minifyIdentifiers: false,
  minifySyntax: false,
  minifyWhitespace: false,

  // SAFETY: Prevent removal of exports discovered by string name
  treeShaking: false,

  // SAFETY: Single file output
  splitting: false,

  // SAFETY: Preserve names for workflow type inference
  keepNames: true,
};

/**
 * Validate user-provided esbuild options don't break invariants.
 */
function validateUserOptions(opts: Partial<esbuild.BuildOptions> | undefined): void {
  if (!opts) return;

  const violations: string[] = [];

  if (opts.minify === true) {
    violations.push('minify: true breaks workflow type names');
  }
  if (opts.minifyIdentifiers === true) {
    violations.push('minifyIdentifiers: true breaks workflow type names');
  }
  if (opts.treeShaking === true) {
    violations.push('treeShaking: true may remove workflow exports');
  }
  if (opts.splitting === true) {
    violations.push('splitting: true not supported in workflow isolate');
  }
  if (opts.format && opts.format !== 'cjs') {
    violations.push(`format must be 'cjs', got '${opts.format}'`);
  }
  if (opts.keepNames === false) {
    violations.push('keepNames: false breaks workflow type inference');
  }

  if (violations.length > 0) {
    throw new WorkflowBundleError('CONFIG_INVALID', { violations });
  }
}

/**
 * WorkflowCodeBundler creates bundles for Temporal workflows using esbuild.
 */
export class WorkflowCodeBundler {
  readonly logger: Logger;
  readonly workflowsPath: string;
  readonly workflowInterceptorModules: string[];
  readonly payloadConverterPath: string | undefined;
  readonly failureConverterPath: string | undefined;
  readonly ignoreModules: string[];
  readonly mode: 'development' | 'production';
  readonly sourceMap: 'inline' | 'external' | 'none';
  readonly buildOptions: Partial<esbuild.BuildOptions> | undefined;
  readonly plugins: BundlerPlugin[];
  readonly report: boolean;
  readonly inputFlavor: InputFlavor | undefined;
  readonly denoConfigPath: string | undefined;
  readonly importMapPath: string | undefined;

  constructor(options: BundleOptions) {
    // Apply bundler plugins
    let resolvedOptions = options;
    const plugins = options.plugins ?? [];
    for (const plugin of plugins) {
      if (plugin.configureBundler) {
        resolvedOptions = plugin.configureBundler(resolvedOptions);
      }
    }

    this.logger = resolvedOptions.logger ?? nullLogger;
    this.workflowsPath = resolvedOptions.workflowsPath;
    this.workflowInterceptorModules = resolvedOptions.workflowInterceptorModules ?? [];
    this.payloadConverterPath = resolvedOptions.payloadConverterPath;
    this.failureConverterPath = resolvedOptions.failureConverterPath;
    this.ignoreModules = resolvedOptions.ignoreModules ?? [];
    this.mode = resolvedOptions.mode ?? 'development';
    this.sourceMap = resolvedOptions.sourceMap ?? 'inline';
    this.buildOptions = resolvedOptions.buildOptions;
    this.plugins = plugins;
    this.report = resolvedOptions.report !== false;
    this.inputFlavor = resolvedOptions.inputFlavor;
    this.denoConfigPath = resolvedOptions.denoConfigPath;
    this.importMapPath = resolvedOptions.importMapPath;

    // Validate user options
    validateUserOptions(this.buildOptions);
  }

  /**
   * Create the workflow bundle.
   */
  async createBundle(): Promise<WorkflowBundle> {
    const startTime = Date.now();

    // Validate workflowsPath exists
    if (!existsSync(this.workflowsPath)) {
      throw new WorkflowBundleError('ENTRYPOINT_NOT_FOUND', {
        details: `Path does not exist: ${this.workflowsPath}`,
      });
    }

    // Generate synthetic entrypoint
    const entrypointOptions = {
      workflowsPath: this.workflowsPath,
      workflowInterceptorModules: this.workflowInterceptorModules,
      payloadConverterPath: this.payloadConverterPath,
      failureConverterPath: this.failureConverterPath,
    };
    const entrypointCode = generateEntrypoint(entrypointOptions);
    const entryHash = hashEntrypoint(entrypointOptions);

    // Create a virtual entrypoint file
    const entrypointPath = this.makeEntrypointPath();

    this.logger.debug('Starting bundle', { entrypointPath, mode: this.mode });

    // Load determinism policy
    const policy = loadDeterminismPolicy();

    // Create the Temporal plugin with shared state for post-build validation
    const { plugin: temporalPlugin, state: pluginState } = createTemporalPlugin({
      ignoreModules: this.ignoreModules,
      payloadConverterPath: this.payloadConverterPath,
      failureConverterPath: this.failureConverterPath,
      policy,
    });

    // Create the cross-runtime plugin for Deno/Bun input support
    const crossRuntimeConfig = resolveCrossRuntimeConfig(
      this.workflowsPath,
      this.inputFlavor,
      this.denoConfigPath,
      this.importMapPath,
    );
    const crossRuntimePlugin = createCrossRuntimePlugin(
      crossRuntimeConfig,
      this.workflowsPath,
    );

    this.logger.debug('Cross-runtime config', {
      inputFlavor: crossRuntimeConfig.inputFlavor,
      denoConfigPath: crossRuntimeConfig.denoConfigPath,
      importMapPath: crossRuntimeConfig.importMapPath,
    });

    // Build with esbuild
    const warnings: string[] = [];
    let result: esbuild.BuildResult;

    try {
      result = await esbuild.build({
        // User options (validated)
        ...this.buildOptions,

        // Enforced options (override user)
        ...ENFORCED_OPTIONS,

        // Source map configuration
        sourcemap: this.sourceMap === 'none' ? false : this.sourceMap,

        // Virtual entrypoint via stdin
        stdin: {
          contents: entrypointCode,
          resolveDir: dirname(this.workflowsPath),
          sourcefile: entrypointPath,
          loader: 'js',
        },

        // Output configuration
        outfile: 'workflow-bundle.js',
        metafile: true,

        // Plugins: cross-runtime first (for import map resolution), then temporal
        plugins: [
          crossRuntimePlugin,
          temporalPlugin,
          ...(this.buildOptions?.plugins ?? []),
        ],
      });
    } catch (error) {
      // Re-throw WorkflowBundleError directly
      if (error instanceof WorkflowBundleError) {
        throw error;
      }

      const message = error instanceof Error ? error.message : String(error);
      throw new WorkflowBundleError('BUILD_FAILED', {
        details: message,
      });
    }

    // Post-build validation: check for forbidden modules
    if (pluginState.foundProblematicModules.size > 0) {
      const modules = Array.from(pluginState.foundProblematicModules.keys());

      // Find dependency chains using the metafile
      let dependencyChain: string[] | undefined;
      if (result.metafile) {
        const chains = findAllDependencyChains(
          result.metafile,
          pluginState.foundProblematicModules,
        );

        // Use the first chain found for the error message
        // (typically the most relevant one)
        for (const [moduleName, chain] of chains) {
          if (chain && chain.length > 0) {
            dependencyChain = formatDependencyChain(chain);
            this.logger.debug('Found dependency chain for forbidden module', {
              module: moduleName,
              chain: dependencyChain,
            });
            break;
          }
        }
      }

      const details = Array.from(pluginState.foundProblematicModules.entries())
        .map(([mod, importer]) => `  - '${mod}' (imported from ${importer})`)
        .join('\n');

      throw new WorkflowBundleError('FORBIDDEN_MODULES', {
        modules,
        details,
        ...(dependencyChain ? { dependencyChain } : {}),
      });
    }

    // Extract warnings
    if (result.warnings.length > 0) {
      for (const warning of result.warnings) {
        warnings.push(warning.text);
        this.logger.warn('Build warning', { text: warning.text });
      }
    }

    // Get the output
    if (!result.outputFiles || result.outputFiles.length === 0) {
      throw new WorkflowBundleError('BUILD_FAILED', {
        details: 'esbuild produced no output files',
      });
    }

    // Find the main bundle and optional source map
    const bundleFile = result.outputFiles.find((f) => f.path.endsWith('.js'));
    const mapFile = result.outputFiles.find((f) => f.path.endsWith('.map'));

    if (!bundleFile) {
      throw new WorkflowBundleError('BUILD_FAILED', {
        details: 'esbuild produced no JavaScript output',
      });
    }

    // Apply shim to the output
    // Hash the actual bundle content to prevent module cache collisions
    // when workflow code changes but entrypoint config stays the same
    const bundleHash = generateBundleHash(bundleFile.text);
    const shimmedCode = shimEsbuildOutput(bundleFile.text, bundleHash);

    // Validate shimmed output
    const shimValidation = validateShimmedOutput(shimmedCode);
    if (!shimValidation.valid) {
      throw new WorkflowBundleError('BUILD_FAILED', {
        details: `Shim validation failed: ${shimValidation.error}`,
      });
    }

    const buildTime = Date.now() - startTime;
    const sizeKB = (shimmedCode.length / 1024).toFixed(1);
    this.logger.info('Workflow bundle created', {
      size: `${sizeKB}KB`,
      time: `${buildTime}ms`,
    });

    // Build metadata
    const metadata: BundleMetadata | undefined = this.report
      ? {
          createdAt: new Date().toISOString(),
          mode: this.mode,
          entryHash,
          bundlerVersion: getBundlerVersion(),
          temporalSdkVersion: getTemporalSdkVersion() ?? 'unknown',
          externals: this.ignoreModules.length > 0 ? this.ignoreModules : undefined,
          warnings: warnings.length > 0 ? warnings : undefined,
        }
      : undefined;

    return {
      code: shimmedCode,
      sourceMap: mapFile?.text,
      metadata,
    };
  }

  /**
   * Generate a path for the synthetic entrypoint.
   */
  private makeEntrypointPath(): string {
    const stat = statSync(this.workflowsPath);
    if (stat.isFile()) {
      const { root, dir, name } = parse(this.workflowsPath);
      return join(root, dir, `${name}-autogenerated-entrypoint.cjs`);
    } else {
      const { root, dir, base } = parse(this.workflowsPath);
      return join(root, dir, `${base}-autogenerated-entrypoint.cjs`);
    }
  }
}

/**
 * Create a bundle to pass to WorkerOptions.workflowBundle.
 *
 * This is a faster alternative to @temporalio/worker's bundleWorkflowCode
 * that uses esbuild instead of Webpack.
 */
export async function bundleWorkflowCode(
  options: BundleOptions,
): Promise<WorkflowBundle> {
  const bundler = new WorkflowCodeBundler(options);
  return bundler.createBundle();
}
