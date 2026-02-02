/**
 * Environment information utilities for benchmarking.
 */

import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import os from 'node:os';
import { join } from 'node:path';

import type { EnvironmentInfo } from '../types';
import { isHighResolutionTimingAvailable, measureTimerResolution } from './timing';

/**
 * Get the Bun version.
 */
function getBunVersion(): string {
  if (typeof Bun !== 'undefined' && Bun.version) {
    return Bun.version;
  }
  try {
    return execSync('bun --version', { encoding: 'utf-8' }).trim();
  } catch {
    return 'unknown';
  }
}

/**
 * Get the Node.js version.
 */
function getNodeVersion(): string {
  return process.version;
}

/**
 * Get CPU model string.
 */
function getCpuModel(): string {
  const cpus = os.cpus();
  if (cpus.length > 0) {
    return cpus[0].model;
  }
  return 'unknown';
}

/**
 * Get the number of CPU cores.
 */
function getCpuCores(): number {
  return os.cpus().length;
}

/**
 * Get total system memory in bytes.
 */
function getTotalMemory(): number {
  return os.totalmem();
}

/**
 * Get the current git commit hash (short).
 */
function getGitCommit(): string | undefined {
  try {
    return execSync('git rev-parse --short HEAD', { encoding: 'utf-8' }).trim();
  } catch {
    return undefined;
  }
}

/**
 * Check if the git working directory is dirty.
 */
function isGitDirty(): boolean | undefined {
  try {
    const status = execSync('git status --porcelain', { encoding: 'utf-8' }).trim();
    return status.length > 0;
  } catch {
    return undefined;
  }
}

/**
 * Get key dependency versions from package.json.
 */
function getDependencyVersions(): Record<string, string> {
  const deps: Record<string, string> = {};
  const keyDeps = ['esbuild', 'webpack', '@temporalio/workflow', '@temporalio/worker'];

  try {
    const packageJsonPath = join(process.cwd(), 'package.json');
    const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf-8'));

    const allDeps = {
      ...packageJson.dependencies,
      ...packageJson.devDependencies,
    };

    for (const dep of keyDeps) {
      if (allDeps[dep]) {
        deps[dep] = allDeps[dep].replace(/^[\^~]/, '');
      }
    }
  } catch {
    // Ignore errors reading package.json
  }

  return deps;
}

/**
 * Capture complete environment information.
 */
export function captureEnvironment(): EnvironmentInfo {
  const timerResolution = measureTimerResolution(20);
  const highResTiming = isHighResolutionTimingAvailable();
  const gitCommit = getGitCommit();
  const gitDirty = isGitDirty();
  const dependencies = getDependencyVersions();

  return {
    platform: os.platform(),
    arch: os.arch(),
    bunVersion: getBunVersion(),
    nodeVersion: getNodeVersion(),
    cpuModel: getCpuModel(),
    cpuCores: getCpuCores(),
    totalMemory: getTotalMemory(),
    timestamp: new Date().toISOString(),
    timerResolutionUs: timerResolution,
    highResTimingAvailable: highResTiming,
    gitCommit,
    gitDirty,
    dependencies: Object.keys(dependencies).length > 0 ? dependencies : undefined,
  };
}

/**
 * Format environment info for display.
 */
export function formatEnvironment(env: EnvironmentInfo): string {
  const memoryGB = (env.totalMemory / (1024 * 1024 * 1024)).toFixed(1);

  return [
    `Platform: ${env.platform} (${env.arch})`,
    `Runtime: Node ${env.nodeVersion}`,
    `Bun: ${env.bunVersion}`,
    `CPU: ${env.cpuModel} (${env.cpuCores} cores)`,
    `Memory: ${memoryGB} GB`,
    `Timestamp: ${env.timestamp}`,
  ].join('\n');
}
