/**
 * Statistical utility functions for benchmark analysis.
 */

import type { ExtendedStatSummary, StatSummary } from '../types';

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
 * Calculate interquartile range (IQR).
 */
export function iqr(values: number[]): number {
  if (values.length < 4) return 0;
  const q1 = percentile(values, 25);
  const q3 = percentile(values, 75);
  return q3 - q1;
}

/**
 * Filter outliers using IQR method.
 * Values below Q1 - 1.5*IQR or above Q3 + 1.5*IQR are considered outliers.
 */
export function filterOutliers(values: number[]): { filtered: number[]; outliersRemoved: number } {
  if (values.length < 4) {
    return { filtered: values, outliersRemoved: 0 };
  }

  const q1 = percentile(values, 25);
  const q3 = percentile(values, 75);
  const iqrValue = q3 - q1;
  const lowerBound = q1 - 1.5 * iqrValue;
  const upperBound = q3 + 1.5 * iqrValue;

  const filtered = values.filter((v) => v >= lowerBound && v <= upperBound);
  return {
    filtered,
    outliersRemoved: values.length - filtered.length,
  };
}

/**
 * Calculate coefficient of variation (CV).
 * CV = (stdDev / mean) * 100
 */
export function coefficientOfVariation(values: number[]): number {
  if (values.length === 0) return 0;
  const m = mean(values);
  if (m === 0) return 0;
  return (stdDev(values) / m) * 100;
}

/**
 * Calculate 95% confidence interval.
 * Uses t-distribution critical value for small samples.
 */
export function confidenceInterval95(values: number[]): { lower: number; upper: number } {
  if (values.length < 2) {
    const m = mean(values);
    return { lower: m, upper: m };
  }

  const m = mean(values);
  const s = stdDev(values);
  const n = values.length;

  // t-critical values for 95% CI (two-tailed)
  // For larger samples, approaches 1.96
  const tCritical = getTCritical(n - 1);
  const marginOfError = tCritical * (s / Math.sqrt(n));

  return {
    lower: m - marginOfError,
    upper: m + marginOfError,
  };
}

/**
 * Get t-critical value for given degrees of freedom (95% CI).
 */
function getTCritical(df: number): number {
  // Lookup table for common degrees of freedom
  const tTable: Record<number, number> = {
    1: 12.706,
    2: 4.303,
    3: 3.182,
    4: 2.776,
    5: 2.571,
    6: 2.447,
    7: 2.365,
    8: 2.306,
    9: 2.262,
    10: 2.228,
    11: 2.201,
    12: 2.179,
    13: 2.16,
    14: 2.145,
    15: 2.131,
    20: 2.086,
    25: 2.06,
    30: 2.042,
    40: 2.021,
    50: 2.009,
    100: 1.984,
  };

  if (df in tTable) return tTable[df];

  // Interpolate or use approximate for larger df
  if (df > 100) return 1.96;

  // Find nearest values and interpolate
  const keys = Object.keys(tTable)
    .map(Number)
    .sort((a, b) => a - b);
  for (let i = 0; i < keys.length - 1; i++) {
    if (df > keys[i] && df < keys[i + 1]) {
      const lower = keys[i];
      const upper = keys[i + 1];
      const ratio = (df - lower) / (upper - lower);
      return tTable[lower] + ratio * (tTable[upper] - tTable[lower]);
    }
  }

  return 1.96; // Fallback to z-score
}

/**
 * Perform Welch's t-test and return the p-value.
 * Tests whether two samples have significantly different means.
 */
export function welchTTest(sample1: number[], sample2: number[]): number {
  if (sample1.length < 2 || sample2.length < 2) return 1;

  const n1 = sample1.length;
  const n2 = sample2.length;
  const m1 = mean(sample1);
  const m2 = mean(sample2);
  const v1 = variance(sample1);
  const v2 = variance(sample2);

  // Welch's t-statistic
  const se1 = v1 / n1;
  const se2 = v2 / n2;
  const t = (m1 - m2) / Math.sqrt(se1 + se2);

  // Welch-Satterthwaite degrees of freedom
  const df = Math.pow(se1 + se2, 2) / (Math.pow(se1, 2) / (n1 - 1) + Math.pow(se2, 2) / (n2 - 1));

  // Calculate p-value using t-distribution approximation
  return tDistributionPValue(Math.abs(t), df);
}

/**
 * Calculate variance (sample variance with Bessel's correction).
 */
function variance(values: number[]): number {
  if (values.length < 2) return 0;
  const m = mean(values);
  const squaredDiffs = values.map((v) => Math.pow(v - m, 2));
  return squaredDiffs.reduce((sum, v) => sum + v, 0) / (values.length - 1);
}

/**
 * Approximate p-value from t-distribution.
 * Uses a simple approximation suitable for benchmark comparisons.
 */
function tDistributionPValue(t: number, df: number): number {
  // Approximation using the relationship between t and normal distribution
  // For large df, t approaches normal distribution
  const x = df / (df + t * t);

  // Beta function approximation for incomplete beta
  // This is a simplified approximation
  const a = df / 2;
  const b = 0.5;

  // For reasonable df values, use a lookup-based approach
  if (t <= 0) return 1;

  // Approximation: for two-tailed test
  // Using Hill's algorithm for incomplete beta approximation
  const p = incompleteBetaApprox(x, a, b);
  return p;
}

/**
 * Approximation of incomplete beta function for p-value calculation.
 * Note: _a and _b are included for future use with more accurate implementations.
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function incompleteBetaApprox(x: number, _a: number, _b: number): number {
  // Simple approximation for our use case
  // For a = df/2, b = 0.5, this gives reasonable p-values

  if (x <= 0) return 0;
  if (x >= 1) return 1;

  // Using a continued fraction approximation
  // Simplified for benchmark use - not a full implementation
  const t = Math.sqrt(-2 * Math.log(x));
  const c0 = 2.515517;
  const c1 = 0.802853;
  const c2 = 0.010328;
  const d1 = 1.432788;
  const d2 = 0.189269;
  const d3 = 0.001308;

  const p = t - (c0 + c1 * t + c2 * t * t) / (1 + d1 * t + d2 * t * t + d3 * t * t * t);

  // Convert to p-value (two-tailed)
  return Math.max(0, Math.min(1, 2 * (1 - normalCDF(p))));
}

/**
 * Standard normal cumulative distribution function.
 */
function normalCDF(x: number): number {
  // Approximation using error function
  const a1 = 0.254829592;
  const a2 = -0.284496736;
  const a3 = 1.421413741;
  const a4 = -1.453152027;
  const a5 = 1.061405429;
  const p = 0.3275911;

  const sign = x < 0 ? -1 : 1;
  x = Math.abs(x) / Math.sqrt(2);

  const t = 1.0 / (1.0 + p * x);
  const y = 1.0 - ((((a5 * t + a4) * t + a3) * t + a2) * t + a1) * t * Math.exp(-x * x);

  return 0.5 * (1.0 + sign * y);
}

/**
 * Calculate Cohen's d effect size.
 * d = (mean1 - mean2) / pooledStdDev
 */
export function cohensD(sample1: number[], sample2: number[]): number {
  if (sample1.length < 2 || sample2.length < 2) return 0;

  const m1 = mean(sample1);
  const m2 = mean(sample2);
  const v1 = variance(sample1);
  const v2 = variance(sample2);
  const n1 = sample1.length;
  const n2 = sample2.length;

  // Pooled standard deviation
  const pooledVar = ((n1 - 1) * v1 + (n2 - 1) * v2) / (n1 + n2 - 2);
  const pooledStdDev = Math.sqrt(pooledVar);

  if (pooledStdDev === 0) return 0;
  return (m1 - m2) / pooledStdDev;
}

/**
 * Calculate extended statistics with optional outlier filtering.
 */
export function calculateExtendedStats(
  values: number[],
  shouldFilterOutliers = true,
): ExtendedStatSummary {
  let processedValues = values;
  let outliersRemoved = 0;

  if (shouldFilterOutliers && values.length >= 4) {
    const result = filterOutliers(values);
    processedValues = result.filtered;
    outliersRemoved = result.outliersRemoved;
  }

  const baseStats = calculateStats(processedValues);
  const ci = confidenceInterval95(processedValues);
  const cv = coefficientOfVariation(processedValues);

  return {
    ...baseStats,
    ci95Lower: ci.lower,
    ci95Upper: ci.upper,
    coefficientOfVariation: cv,
    outliersRemoved,
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
