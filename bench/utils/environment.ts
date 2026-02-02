/**
 * Environment information utilities for benchmarking.
 */

import { execSync } from 'node:child_process';
import os from 'node:os';

import type { EnvironmentInfo } from '../types';

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
 * Capture complete environment information.
 */
export function captureEnvironment(): EnvironmentInfo {
  return {
    platform: os.platform(),
    arch: os.arch(),
    bunVersion: getBunVersion(),
    nodeVersion: getNodeVersion(),
    cpuModel: getCpuModel(),
    cpuCores: getCpuCores(),
    totalMemory: getTotalMemory(),
    timestamp: new Date().toISOString(),
  };
}

/**
 * Format environment info for display.
 */
export function formatEnvironment(env: EnvironmentInfo): string {
  const memoryGB = (env.totalMemory / (1024 * 1024 * 1024)).toFixed(1);

  return [
    `Platform: ${env.platform} (${env.arch})`,
    `Bun: ${env.bunVersion}`,
    `Node: ${env.nodeVersion}`,
    `CPU: ${env.cpuModel} (${env.cpuCores} cores)`,
    `Memory: ${memoryGB} GB`,
    `Timestamp: ${env.timestamp}`,
  ].join('\n');
}
