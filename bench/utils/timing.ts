/**
 * Timing utilities for benchmark measurements.
 */

/**
 * Measure timer resolution by sampling performance.now() differences.
 * @param samples Number of samples to take
 * @returns Timer resolution in microseconds
 */
export function measureTimerResolution(samples = 100): number {
  const diffs: number[] = [];

  for (let i = 0; i < samples; i++) {
    const start = performance.now();
    let end = start;

    // Spin until we get a different value
    while (end === start) {
      end = performance.now();
    }

    diffs.push((end - start) * 1000); // Convert to microseconds
  }

  // Return the minimum non-zero difference as the resolution
  const sorted = diffs.filter((d) => d > 0).sort((a, b) => a - b);
  return sorted.length > 0 ? sorted[0] : 1000; // Default to 1ms if no valid samples
}

/**
 * Check if high-resolution timing is available.
 * Considers timing "high resolution" if resolution is below 100 microseconds.
 */
export function isHighResolutionTimingAvailable(): boolean {
  const resolution = measureTimerResolution(10);
  return resolution < 100;
}

/**
 * Benchmark marker for User Timing API integration.
 */
export interface BenchmarkMarker {
  /** Mark the start of the measurement */
  start(): void;
  /** Mark the end of the measurement */
  end(): void;
  /** Get the measure result */
  measure(): PerformanceMeasure | null;
}

/**
 * Create a benchmark marker using the User Timing API.
 * @param name Name for the marker/measure
 */
export function createBenchmarkMarker(name: string): BenchmarkMarker {
  const startMark = `${name}-start`;
  const endMark = `${name}-end`;
  let measureResult: PerformanceMeasure | null = null;

  return {
    start() {
      try {
        performance.mark(startMark);
      } catch {
        // Ignore if marks not supported
      }
    },

    end() {
      try {
        performance.mark(endMark);
        measureResult = performance.measure(name, startMark, endMark);
      } catch {
        // Ignore if measure not supported
        measureResult = null;
      }
    },

    measure(): PerformanceMeasure | null {
      return measureResult;
    },
  };
}

/**
 * Clear all benchmark marks from the performance timeline.
 */
export function clearBenchmarkMarks(): void {
  try {
    performance.clearMarks();
    performance.clearMeasures();
  } catch {
    // Ignore if clearing not supported
  }
}

/**
 * Get all performance entries for a given name.
 */
export function getPerformanceEntries(name: string): PerformanceEntryList {
  try {
    return performance.getEntriesByName(name);
  } catch {
    return [];
  }
}
