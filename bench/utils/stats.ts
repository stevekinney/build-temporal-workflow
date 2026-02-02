/**
 * Statistical utility functions for benchmark analysis.
 */

import type { StatSummary } from '../types';

/**
 * Calculate the minimum value in an array.
 */
export function min(values: number[]): number {
  if (values.length === 0) return 0;
  return Math.min(...values);
}

/**
 * Calculate the maximum value in an array.
 */
export function max(values: number[]): number {
  if (values.length === 0) return 0;
  return Math.max(...values);
}

/**
 * Calculate the arithmetic mean of an array.
 */
export function mean(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

/**
 * Calculate the median (50th percentile) of an array.
 */
export function median(values: number[]): number {
  if (values.length === 0) return 0;

  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);

  if (sorted.length % 2 === 0) {
    return (sorted[mid - 1] + sorted[mid]) / 2;
  }
  return sorted[mid];
}

/**
 * Calculate the standard deviation of an array.
 */
export function stdDev(values: number[]): number {
  if (values.length < 2) return 0;

  const avg = mean(values);
  const squaredDiffs = values.map((v) => Math.pow(v - avg, 2));
  const variance = squaredDiffs.reduce((sum, v) => sum + v, 0) / (values.length - 1);

  return Math.sqrt(variance);
}

/**
 * Calculate a percentile value from an array.
 * @param values - Array of numeric values
 * @param percentile - Percentile to calculate (0-100)
 */
export function percentile(values: number[], percentile: number): number {
  if (values.length === 0) return 0;
  if (values.length === 1) return values[0];

  const sorted = [...values].sort((a, b) => a - b);
  const index = (percentile / 100) * (sorted.length - 1);
  const lower = Math.floor(index);
  const upper = Math.ceil(index);

  if (lower === upper) {
    return sorted[lower];
  }

  // Linear interpolation
  const fraction = index - lower;
  return sorted[lower] + fraction * (sorted[upper] - sorted[lower]);
}

/**
 * Calculate the 95th percentile.
 */
export function p95(values: number[]): number {
  return percentile(values, 95);
}

/**
 * Calculate a complete statistical summary for an array of values.
 */
export function calculateStats(values: number[]): StatSummary {
  return {
    min: min(values),
    max: max(values),
    mean: mean(values),
    median: median(values),
    stdDev: stdDev(values),
    p95: p95(values),
    count: values.length,
  };
}

/**
 * Format a number with appropriate precision.
 */
export function formatNumber(value: number, decimals = 2): string {
  if (value >= 1000000) {
    return `${(value / 1000000).toFixed(decimals)}M`;
  }
  if (value >= 1000) {
    return `${(value / 1000).toFixed(decimals)}K`;
  }
  return value.toFixed(decimals);
}

/**
 * Format bytes in a human-readable format.
 */
export function formatBytes(bytes: number): string {
  if (bytes >= 1024 * 1024) {
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  }
  if (bytes >= 1024) {
    return `${(bytes / 1024).toFixed(2)} KB`;
  }
  return `${bytes} B`;
}

/**
 * Format milliseconds in a human-readable format.
 */
export function formatMs(ms: number): string {
  if (ms >= 1000) {
    return `${(ms / 1000).toFixed(2)}s`;
  }
  return `${ms.toFixed(2)}ms`;
}

/**
 * Format a speedup ratio.
 */
export function formatSpeedup(ratio: number): string {
  if (ratio >= 10) {
    return `${ratio.toFixed(1)}x`;
  }
  return `${ratio.toFixed(2)}x`;
}
