#!/usr/bin/env bun
/**
 * CLI for the Temporal Workflow Bundler.
 *
 * Commands:
 * - build: Bundle workflow code
 * - analyze: Show bundle composition and dependency information
 * - doctor: Validate environment and configuration
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

import * as esbuild from 'esbuild';

import { bundleWorkflowCode, createConsoleLogger, watchWorkflowCode } from './bundler';
import { formatCIReportText, generateCIReport } from './ci-output';
import {
  findAllDependencyChains,
  formatDependencyChain,
  summarizeDependencyChain,
} from './dependency-chain';
import { verifyDeterministicBuild } from './determinism-verify';
import { generateEntrypoint } from './entrypoint';
import { WorkflowBundleError } from './errors';
import { createTemporalPlugin } from './esbuild-plugin';
import { loadDeterminismPolicy } from './policy';
import { generateSigningKeyPair, signBundle } from './signing';
import { analyzeSize, parseSize } from './size-analysis';
import type { BundleOptions } from './types';
import { getBundlerVersion, getTemporalSdkVersion } from './validate';

// ANSI color codes (chalk is a devDependency, so we use raw codes for the CLI)
const colors = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
  gray: '\x1b[90m',
};

function log(message: string): void {
  console.log(message);
}

function success(message: string): void {
  console.log(`${colors.green}✓${colors.reset} ${message}`);
}

function error(message: string): void {
  console.error(`${colors.red}✗${colors.reset} ${message}`);
}

function warn(message: string): void {
  console.warn(`${colors.yellow}!${colors.reset} ${message}`);
}

function info(message: string): void {
  console.log(`${colors.blue}ℹ${colors.reset} ${message}`);
}

function heading(message: string): void {
  console.log(`\n${colors.bold}${message}${colors.reset}`);
}

interface CLIOptions {
  workflowsPath?: string;
  output?: string;
  sourceMap?: 'inline' | 'external' | 'none';
  mode?: 'development' | 'production';
  ignoreModules?: string[];
  interceptors?: string[];
  payloadConverter?: string;
  failureConverter?: string;
  json?: boolean;
  verbose?: boolean;
  help?: boolean;
  watch?: boolean;
  budget?: string;
  ci?: boolean;
  strict?: boolean;
  privateKey?: string;
  publicKey?: string;
}

function parseArgs(args: string[]): { command: string; options: CLIOptions } {
  const options: CLIOptions = {};
  let command = 'help';
  let commandSet = false;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i]!;

    if (!arg.startsWith('-')) {
      // First non-flag argument is the command
      if (
        !commandSet &&
        [
          'build',
          'analyze',
          'doctor',
          'help',
          'version',
          'check',
          'verify',
          'sign',
          'keygen',
        ].includes(arg)
      ) {
        command = arg;
        commandSet = true;
      } else if (!options.workflowsPath) {
        // Subsequent non-flag arguments are paths
        options.workflowsPath = arg;
      }
      continue;
    }

    switch (arg) {
      case '-o':
      case '--output':
        options.output = args[++i]!;
        break;
      case '-s':
      case '--source-map':
        options.sourceMap = args[++i] as 'inline' | 'external' | 'none';
        break;
      case '-m':
      case '--mode':
        options.mode = args[++i] as 'development' | 'production';
        break;
      case '-i':
      case '--ignore':
        options.ignoreModules = options.ignoreModules ?? [];
        options.ignoreModules.push(args[++i]!);
        break;
      case '--interceptor':
        options.interceptors = options.interceptors ?? [];
        options.interceptors.push(args[++i]!);
        break;
      case '--payload-converter':
        options.payloadConverter = args[++i]!;
        break;
      case '--failure-converter':
        options.failureConverter = args[++i]!;
        break;
      case '--json':
        options.json = true;
        break;
      case '-w':
      case '--watch':
        options.watch = true;
        break;
      case '-v':
      case '--verbose':
        options.verbose = true;
        break;
      case '-h':
      case '--help':
        options.help = true;
        break;
      case '--version':
        command = 'version';
        break;
      case '--budget':
        options.budget = args[++i]!;
        break;
      case '--ci':
        options.ci = true;
        break;
      case '--strict':
        options.strict = true;
        break;
      case '--private-key':
        options.privateKey = args[++i]!;
        break;
      case '--public-key':
        options.publicKey = args[++i]!;
        break;
    }
  }

  return { command, options };
}

function printUsage(): void {
  const version = getBundlerVersion();
  log(`
${colors.bold}bundle-temporal-workflow${colors.reset} v${version}

A faster alternative to Temporal's bundleWorkflowCode using esbuild.

${colors.bold}USAGE${colors.reset}
  bundle-temporal-workflow <command> [options]

${colors.bold}COMMANDS${colors.reset}
  build <path>     Bundle workflow code for use with Temporal Worker
  analyze <path>   Analyze bundle composition and dependencies
  check <path>     Build and validate against size budgets
  verify <path>    Verify build determinism (reproducible builds)
  sign <path>      Sign a bundle with Ed25519 for deployment verification
  keygen           Generate a new Ed25519 signing key pair
  doctor           Validate environment and SDK compatibility
  help             Show this help message
  version          Show version information

${colors.bold}BUILD OPTIONS${colors.reset}
  -o, --output <file>       Output file path (default: stdout or workflow-bundle.js)
  -s, --source-map <mode>   Source map mode: inline, external, none (default: inline)
  -m, --mode <mode>         Build mode: development, production (default: development)
  -i, --ignore <module>     Ignore a module (can be repeated)
  -w, --watch               Watch for changes and rebuild automatically
  --interceptor <path>      Add interceptor module (can be repeated)
  --payload-converter <p>   Path to custom payload converter
  --failure-converter <p>   Path to custom failure converter
  --json                    Output result as JSON
  --budget <size>           Set size budget (e.g., 500KB, 1MB)
  --ci                      CI-friendly output mode
  --strict                  Strict validation (fail on warnings)
  --private-key <path>      Ed25519 private key for signing
  --public-key <path>       Ed25519 public key for verification
  -v, --verbose             Enable verbose logging

${colors.bold}EXAMPLES${colors.reset}
  ${colors.dim}# Bundle workflows and write to file${colors.reset}
  bundle-temporal-workflow build ./src/workflows.ts -o ./dist/workflow-bundle.js

  ${colors.dim}# Bundle with ignored modules${colors.reset}
  bundle-temporal-workflow build ./src/workflows.ts -i lodash -i moment

  ${colors.dim}# Analyze bundle composition${colors.reset}
  bundle-temporal-workflow analyze ./src/workflows.ts

  ${colors.dim}# Check bundle against a size budget${colors.reset}
  bundle-temporal-workflow check ./src/workflows.ts --budget 500KB --strict

  ${colors.dim}# Verify reproducible builds${colors.reset}
  bundle-temporal-workflow verify ./src/workflows.ts

  ${colors.dim}# Sign a bundle for deployment${colors.reset}
  bundle-temporal-workflow sign ./dist/workflow-bundle.js --private-key ./keys/private.key

  ${colors.dim}# Check environment${colors.reset}
  bundle-temporal-workflow doctor
`);
}

async function buildCommand(options: CLIOptions): Promise<void> {
  if (!options.workflowsPath) {
    error('Missing required argument: workflows path');
    log('\nUsage: bundle-temporal-workflow build <path> [options]');
    process.exit(1);
  }

  const workflowsPath = resolve(options.workflowsPath);

  if (!existsSync(workflowsPath)) {
    error(`Workflows path does not exist: ${workflowsPath}`);
    process.exit(1);
  }

  const bundleOptions: BundleOptions = {
    workflowsPath,
    mode: options.mode ?? 'development',
    sourceMap: options.sourceMap ?? 'inline',
    ignoreModules: options.ignoreModules,
    workflowInterceptorModules: options.interceptors?.map((p) => resolve(p)),
    payloadConverterPath: options.payloadConverter
      ? resolve(options.payloadConverter)
      : undefined,
    failureConverterPath: options.failureConverter
      ? resolve(options.failureConverter)
      : undefined,
    logger: options.verbose ? createConsoleLogger() : undefined,
    report: true,
  };

  // Handle watch mode
  if (options.watch) {
    await watchCommand(options, bundleOptions);
    return;
  }

  const startTime = Date.now();

  try {
    const bundle = await bundleWorkflowCode(bundleOptions);
    const buildTime = Date.now() - startTime;

    if (options.json) {
      const result = {
        success: true,
        buildTime,
        size: bundle.code.length,
        metadata: bundle.metadata,
      };
      log(JSON.stringify(result, null, 2));
    } else if (options.output) {
      // Write to file
      const outputPath = resolve(options.output);
      const outputDir = dirname(outputPath);

      if (!existsSync(outputDir)) {
        mkdirSync(outputDir, { recursive: true });
      }

      writeFileSync(outputPath, bundle.code);

      if (bundle.sourceMap && options.sourceMap === 'external') {
        writeFileSync(`${outputPath}.map`, bundle.sourceMap);
      }

      success(`Bundle written to ${outputPath}`);
      info(`Size: ${formatSize(bundle.code.length)}`);
      info(`Build time: ${buildTime}ms`);

      if (bundle.metadata?.warnings?.length) {
        heading('Warnings');
        for (const warning of bundle.metadata.warnings) {
          warn(warning);
        }
      }
    } else {
      // Write to stdout
      process.stdout.write(bundle.code);
    }
  } catch (err) {
    if (err instanceof WorkflowBundleError) {
      if (options.json) {
        const result = {
          success: false,
          error: {
            code: err.code,
            message: err.message,
            context: err.context,
          },
        };
        log(JSON.stringify(result, null, 2));
      } else {
        error(`Build failed: ${err.code}`);
        log(`\n${err.message}`);
      }
    } else {
      if (options.json) {
        const result = {
          success: false,
          error: {
            message: err instanceof Error ? err.message : String(err),
          },
        };
        log(JSON.stringify(result, null, 2));
      } else {
        error(`Build failed: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
    process.exit(1);
  }
}

/**
 * Handle watch mode - continuously rebuild on file changes.
 */
async function watchCommand(
  cliOptions: CLIOptions,
  bundleOptions: BundleOptions,
): Promise<void> {
  if (!cliOptions.output) {
    error('Watch mode requires --output flag');
    process.exit(1);
  }

  const outputPath = resolve(cliOptions.output);
  const outputDir = dirname(outputPath);

  if (!existsSync(outputDir)) {
    mkdirSync(outputDir, { recursive: true });
  }

  info(`Watching for changes...`);
  info(`Output: ${outputPath}`);
  log('');

  let buildCount = 0;

  const handle = await watchWorkflowCode(bundleOptions, (bundle, err) => {
    buildCount++;
    const timestamp = new Date().toLocaleTimeString();

    if (err) {
      log('');
      error(`[${timestamp}] Build #${buildCount} failed`);
      if (err instanceof WorkflowBundleError) {
        log(`${colors.dim}${err.message}${colors.reset}`);
      } else {
        log(`${colors.dim}${err.message}${colors.reset}`);
      }
      return;
    }

    if (bundle) {
      writeFileSync(outputPath, bundle.code);

      if (bundle.sourceMap && cliOptions.sourceMap === 'external') {
        writeFileSync(`${outputPath}.map`, bundle.sourceMap);
      }

      success(
        `[${timestamp}] Build #${buildCount} complete (${formatSize(bundle.code.length)})`,
      );

      if (bundle.metadata?.warnings?.length) {
        for (const warning of bundle.metadata.warnings) {
          warn(`  ${warning}`);
        }
      }
    }
  });

  // Handle SIGINT (Ctrl+C) gracefully
  process.on('SIGINT', () => {
    log('');
    info('Stopping watcher...');
    handle
      .stop()
      .then(() => {
        success('Watch mode stopped');
        process.exit(0);
      })
      .catch(() => {
        process.exit(1);
      });
  });

  // Keep the process alive
  await new Promise(() => {
    // Never resolves - wait for SIGINT
  });
}

interface AnalyzeResult {
  totalSize: number;
  moduleCount: number;
  modules: Array<{
    path: string;
    size: number;
    imports: string[];
  }>;
  topLevelDependencies: string[];
  forbiddenModulesFound: Array<{
    module: string;
    chain: string[];
  }>;
}

async function analyzeCommand(options: CLIOptions): Promise<void> {
  if (!options.workflowsPath) {
    error('Missing required argument: workflows path');
    log('\nUsage: bundle-temporal-workflow analyze <path> [options]');
    process.exit(1);
  }

  const workflowsPath = resolve(options.workflowsPath);

  if (!existsSync(workflowsPath)) {
    error(`Workflows path does not exist: ${workflowsPath}`);
    process.exit(1);
  }

  try {
    // Generate entrypoint
    const entrypointCode = generateEntrypoint({
      workflowsPath,
      workflowInterceptorModules: options.interceptors?.map((p) => resolve(p)) ?? [],
      payloadConverterPath: options.payloadConverter
        ? resolve(options.payloadConverter)
        : undefined,
      failureConverterPath: options.failureConverter
        ? resolve(options.failureConverter)
        : undefined,
    });

    const policy = loadDeterminismPolicy();
    const { plugin, state } = createTemporalPlugin({
      ignoreModules: options.ignoreModules ?? [],
      policy,
    });

    // Build with metafile to get dependency information
    const result = await esbuild.build({
      stdin: {
        contents: entrypointCode,
        resolveDir: dirname(workflowsPath),
        sourcefile: 'entrypoint.js',
        loader: 'js',
      },
      bundle: true,
      format: 'cjs',
      platform: 'node',
      target: 'es2020',
      write: false,
      metafile: true,
      plugins: [plugin],
    });

    if (!result.metafile) {
      error('Failed to generate metafile');
      process.exit(1);
    }

    const metafile = result.metafile;

    // Analyze the metafile
    const modules: AnalyzeResult['modules'] = [];
    let totalSize = 0;

    for (const [path, input] of Object.entries(metafile.inputs)) {
      modules.push({
        path,
        size: input.bytes,
        imports: input.imports.map((i) => i.path),
      });
      totalSize += input.bytes;
    }

    // Sort by size descending
    modules.sort((a, b) => b.size - a.size);

    // Find top-level dependencies (node_modules at the first level)
    const topLevelDeps = new Set<string>();
    for (const mod of modules) {
      const nodeModulesMatch = mod.path.match(/node_modules\/(@[^/]+\/[^/]+|[^/]+)/);
      if (nodeModulesMatch) {
        topLevelDeps.add(nodeModulesMatch[1]!);
      }
    }

    // Find forbidden modules with their dependency chains
    const forbiddenModulesFound: AnalyzeResult['forbiddenModulesFound'] = [];
    if (state.foundProblematicModules.size > 0) {
      const chains = findAllDependencyChains(metafile, state.foundProblematicModules);
      for (const [moduleName, chain] of chains) {
        forbiddenModulesFound.push({
          module: moduleName,
          chain: chain ? formatDependencyChain(chain) : [],
        });
      }
    }

    const analyzeResult: AnalyzeResult = {
      totalSize,
      moduleCount: modules.length,
      modules,
      topLevelDependencies: Array.from(topLevelDeps).sort(),
      forbiddenModulesFound,
    };

    if (options.json) {
      log(JSON.stringify(analyzeResult, null, 2));
    } else {
      heading('Bundle Analysis');

      log(`\n${colors.bold}Summary${colors.reset}`);
      log(`  Total size: ${formatSize(totalSize)}`);
      log(`  Module count: ${modules.length}`);

      if (topLevelDeps.size > 0) {
        log(`\n${colors.bold}Dependencies (${topLevelDeps.size})${colors.reset}`);
        for (const dep of Array.from(topLevelDeps).sort()) {
          log(`  ${colors.dim}•${colors.reset} ${dep}`);
        }
      }

      log(`\n${colors.bold}Largest Modules${colors.reset}`);
      const top10 = modules.slice(0, 10);
      for (const mod of top10) {
        const percentage = ((mod.size / totalSize) * 100).toFixed(1);
        const bar = generateBar(mod.size / totalSize);
        log(
          `  ${colors.dim}${bar}${colors.reset} ${formatSize(mod.size).padStart(8)} ${colors.dim}(${percentage}%)${colors.reset} ${simplifyPath(mod.path)}`,
        );
      }

      if (forbiddenModulesFound.length > 0) {
        log(`\n${colors.bold}${colors.red}Forbidden Modules Found${colors.reset}`);
        for (const { module: mod, chain } of forbiddenModulesFound) {
          error(mod);
          if (chain.length > 0) {
            log(`    ${colors.dim}${summarizeDependencyChain(chain)}${colors.reset}`);
          }
        }
      } else {
        log(`\n${colors.green}✓ No forbidden modules found${colors.reset}`);
      }
    }
  } catch (err) {
    if (options.json) {
      const result = {
        success: false,
        error: {
          message: err instanceof Error ? err.message : String(err),
        },
      };
      log(JSON.stringify(result, null, 2));
    } else {
      error(`Analysis failed: ${err instanceof Error ? err.message : String(err)}`);
    }
    process.exit(1);
  }
}

interface DoctorCheck {
  name: string;
  status: 'pass' | 'fail' | 'warn';
  message: string;
  details?: string;
}

function doctorCommand(options: CLIOptions): void {
  const checks: DoctorCheck[] = [];

  // Check 1: Bundler version
  const bundlerVersion = getBundlerVersion();
  checks.push({
    name: 'Bundler Version',
    status: 'pass',
    message: `bundle-temporal-workflow v${bundlerVersion}`,
  });

  // Check 2: Temporal SDK version
  const sdkVersion = getTemporalSdkVersion();
  if (sdkVersion) {
    const [major, minor] = sdkVersion.split('.').map(Number);
    if (major! >= 1 && minor! >= 14) {
      checks.push({
        name: 'Temporal SDK',
        status: 'pass',
        message: `@temporalio/workflow v${sdkVersion}`,
      });
    } else {
      checks.push({
        name: 'Temporal SDK',
        status: 'warn',
        message: `@temporalio/workflow v${sdkVersion}`,
        details: 'Recommended version is 1.14.0 or later for full compatibility',
      });
    }
  } else {
    checks.push({
      name: 'Temporal SDK',
      status: 'fail',
      message: '@temporalio/workflow not found',
      details: 'Install @temporalio/workflow as a dependency',
    });
  }

  // Check 3: Temporal Worker
  try {
    require.resolve('@temporalio/worker');
    checks.push({
      name: 'Temporal Worker',
      status: 'pass',
      message: '@temporalio/worker is installed',
    });
  } catch {
    checks.push({
      name: 'Temporal Worker',
      status: 'fail',
      message: '@temporalio/worker not found',
      details: 'Install @temporalio/worker as a dependency',
    });
  }

  // Check 4: Module overrides available
  try {
    require.resolve('@temporalio/worker/lib/workflow/module-overrides/assert.js');
    checks.push({
      name: 'Module Overrides',
      status: 'pass',
      message: 'Temporal module stubs are available',
    });
  } catch {
    checks.push({
      name: 'Module Overrides',
      status: 'fail',
      message: 'Module overrides not found',
      details:
        'Ensure @temporalio/worker is version 1.14.0 or later and properly installed',
    });
  }

  // Check 5: esbuild version
  try {
    const esbuildVersion = esbuild.version;
    checks.push({
      name: 'esbuild',
      status: 'pass',
      message: `esbuild v${esbuildVersion}`,
    });
  } catch {
    checks.push({
      name: 'esbuild',
      status: 'fail',
      message: 'esbuild not found',
      details: 'esbuild should be installed as a dependency',
    });
  }

  // Check 6: Node.js version
  const nodeVersion = process.version;
  const nodeMajor = parseInt(nodeVersion.slice(1).split('.')[0]!, 10);
  if (nodeMajor >= 18) {
    checks.push({
      name: 'Node.js',
      status: 'pass',
      message: `Node.js ${nodeVersion}`,
    });
  } else {
    checks.push({
      name: 'Node.js',
      status: 'warn',
      message: `Node.js ${nodeVersion}`,
      details: 'Node.js 18+ is recommended for best compatibility',
    });
  }

  // Check 7: Bun runtime (if running under Bun)
  if (typeof Bun !== 'undefined') {
    checks.push({
      name: 'Bun Runtime',
      status: 'pass',
      message: `Bun v${Bun.version}`,
    });
  }

  // Output results
  if (options.json) {
    const result = {
      checks,
      summary: {
        total: checks.length,
        passed: checks.filter((c) => c.status === 'pass').length,
        warnings: checks.filter((c) => c.status === 'warn').length,
        failed: checks.filter((c) => c.status === 'fail').length,
      },
    };
    log(JSON.stringify(result, null, 2));
  } else {
    heading('Environment Check');
    log('');

    for (const check of checks) {
      const icon =
        check.status === 'pass'
          ? `${colors.green}✓${colors.reset}`
          : check.status === 'warn'
            ? `${colors.yellow}!${colors.reset}`
            : `${colors.red}✗${colors.reset}`;

      log(`${icon} ${colors.bold}${check.name}${colors.reset}: ${check.message}`);

      if (check.details) {
        log(`  ${colors.dim}${check.details}${colors.reset}`);
      }
    }

    log('');

    const failed = checks.filter((c) => c.status === 'fail').length;
    const warned = checks.filter((c) => c.status === 'warn').length;

    if (failed > 0) {
      error(`${failed} check(s) failed`);
      process.exit(1);
    } else if (warned > 0) {
      warn(`${warned} warning(s)`);
    } else {
      success('All checks passed');
    }
  }
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function generateBar(ratio: number): string {
  const width = 20;
  const filled = Math.round(ratio * width);
  return '█'.repeat(filled) + '░'.repeat(width - filled);
}

function simplifyPath(path: string): string {
  // Simplify node_modules paths
  const nodeModulesMatch = path.match(/node_modules\/(.+)/);
  if (nodeModulesMatch) {
    return nodeModulesMatch[1]!;
  }
  return path;
}

async function checkCommand(options: CLIOptions): Promise<void> {
  if (!options.workflowsPath) {
    error('Missing required argument: workflows path');
    log('\nUsage: bundle-temporal-workflow check <path> [--budget <size>] [--strict]');
    process.exit(1);
  }

  const workflowsPath = resolve(options.workflowsPath);

  if (!existsSync(workflowsPath)) {
    error(`Workflows path does not exist: ${workflowsPath}`);
    process.exit(1);
  }

  try {
    const bundle = await bundleWorkflowCode({
      workflowsPath,
      mode: options.mode ?? 'production',
      sourceMap: 'none',
      logger: options.verbose ? createConsoleLogger() : undefined,
      report: true,
    });

    const budget = options.budget ? { total: parseSize(options.budget) } : undefined;
    const analysis = analyzeSize(bundle, budget);

    if (options.ci || options.json) {
      const report = generateCIReport(bundle, { sizeAnalysis: analysis });
      if (options.strict && analysis.budgetResult?.status === 'warn') {
        report.success = false;
      }
      log(options.json ? JSON.stringify(report, null, 2) : formatCIReportText(report));
      if (!report.success) process.exit(1);
    } else {
      heading('Bundle Check');
      info(
        `Size: ${formatSize(analysis.totalSize)} (gzip: ${formatSize(analysis.gzipSize)})`,
      );
      info(`Modules: ${analysis.moduleCount}`);

      if (analysis.budgetResult) {
        const icon =
          analysis.budgetResult.status === 'pass'
            ? colors.green + '✓'
            : analysis.budgetResult.status === 'warn'
              ? colors.yellow + '!'
              : colors.red + '✗';
        log(`${icon}${colors.reset} ${analysis.budgetResult.message}`);
      }

      if (analysis.budgetResult?.status === 'fail') process.exit(1);
      if (options.strict && analysis.budgetResult?.status === 'warn') process.exit(1);
    }
  } catch (err) {
    error(`Check failed: ${err instanceof Error ? err.message : String(err)}`);
    process.exit(1);
  }
}

async function verifyCommand(options: CLIOptions): Promise<void> {
  if (!options.workflowsPath) {
    error('Missing required argument: workflows path');
    log('\nUsage: bundle-temporal-workflow verify <path>');
    process.exit(1);
  }

  const workflowsPath = resolve(options.workflowsPath);

  if (!existsSync(workflowsPath)) {
    error(`Workflows path does not exist: ${workflowsPath}`);
    process.exit(1);
  }

  try {
    info('Verifying build determinism (building 3 times)...');

    const result = await verifyDeterministicBuild({
      workflowsPath,
      mode: options.mode ?? 'production',
      sourceMap: 'none',
    });

    if (options.json) {
      log(JSON.stringify(result, null, 2));
    } else {
      if (result.deterministic) {
        success(
          `Build is deterministic (${result.buildCount} builds, hash: ${result.referenceHash.slice(0, 12)}...)`,
        );
      } else {
        error('Build is NOT deterministic!');
        if (result.differences) {
          heading('Differences found:');
          for (const diff of result.differences) {
            log(`  ${diff}`);
          }
        }
        process.exit(1);
      }
    }
  } catch (err) {
    error(`Verify failed: ${err instanceof Error ? err.message : String(err)}`);
    process.exit(1);
  }
}

async function signCommand(options: CLIOptions): Promise<void> {
  if (!options.workflowsPath) {
    error('Missing required argument: bundle path');
    log('\nUsage: bundle-temporal-workflow sign <path> --private-key <key-file>');
    process.exit(1);
  }

  if (!options.privateKey) {
    error('Missing required option: --private-key');
    process.exit(1);
  }

  const bundlePath = resolve(options.workflowsPath);
  const keyPath = resolve(options.privateKey);

  if (!existsSync(bundlePath)) {
    error(`Bundle file does not exist: ${bundlePath}`);
    process.exit(1);
  }

  if (!existsSync(keyPath)) {
    error(`Private key file does not exist: ${keyPath}`);
    process.exit(1);
  }

  try {
    const code = readFileSync(bundlePath, 'utf-8');
    const privateKey = readFileSync(keyPath, 'utf-8').trim();

    const signed = await signBundle({ code }, privateKey);
    const outputPath = options.output ? resolve(options.output) : bundlePath;

    const output = JSON.stringify({
      code: signed.code,
      signature: signed.signature,
      publicKey: signed.publicKey,
    });
    writeFileSync(outputPath, output);

    success(`Bundle signed and written to ${outputPath}`);
    info(`Public key: ${signed.publicKey.slice(0, 32)}...`);
  } catch (err) {
    error(`Signing failed: ${err instanceof Error ? err.message : String(err)}`);
    process.exit(1);
  }
}

async function keygenCommand(options: CLIOptions): Promise<void> {
  try {
    const keyPair = await generateSigningKeyPair();

    if (options.json) {
      log(JSON.stringify(keyPair, null, 2));
    } else {
      heading('Generated Ed25519 Key Pair');
      log(`\n${colors.bold}Private Key:${colors.reset}`);
      log(keyPair.privateKey);
      log(`\n${colors.bold}Public Key:${colors.reset}`);
      log(keyPair.publicKey);
      log(
        `\n${colors.dim}Store the private key securely (e.g., CI secrets).${colors.reset}`,
      );
      log(
        `${colors.dim}Distribute the public key for bundle verification.${colors.reset}`,
      );
    }
  } catch (err) {
    error(`Key generation failed: ${err instanceof Error ? err.message : String(err)}`);
    process.exit(1);
  }
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const { command, options } = parseArgs(args);

  if (options.help) {
    printUsage();
    return;
  }

  switch (command) {
    case 'build':
      await buildCommand(options);
      break;
    case 'analyze':
      await analyzeCommand(options);
      break;
    case 'check':
      await checkCommand(options);
      break;
    case 'verify':
      await verifyCommand(options);
      break;
    case 'sign':
      await signCommand(options);
      break;
    case 'keygen':
      await keygenCommand(options);
      break;
    case 'doctor':
      doctorCommand(options);
      break;
    case 'version':
      log(`bundle-temporal-workflow v${getBundlerVersion()}`);
      break;
    case 'help':
    default:
      printUsage();
      break;
  }
}

main().catch((err) => {
  error(`Unexpected error: ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
});
