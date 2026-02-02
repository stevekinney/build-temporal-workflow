/**
 * Memory measurement utilities for benchmarking.
 */

/**
 * Force garbage collection if available.
 * In Bun, this is available via Bun.gc().
 */
export function forceGC(): void {
  if (typeof Bun !== 'undefined' && typeof Bun.gc === 'function') {
    Bun.gc(true); // Force synchronous GC
  }
}

/**
 * Get current heap memory usage in bytes.
 */
export function getHeapUsed(): number {
  if (typeof Bun !== 'undefined') {
    // Bun provides memory info through process.memoryUsage()
    return process.memoryUsage().heapUsed;
  }
  return process.memoryUsage().heapUsed;
}

/**
 * Get total heap size in bytes.
 */
export function getHeapTotal(): number {
  return process.memoryUsage().heapTotal;
}

/**
 * Measure memory usage before and after running a function.
 * Forces GC before and after to get accurate readings.
 */
export async function measureMemory<T>(
  fn: () => Promise<T>,
): Promise<{ result: T; memoryDelta: number; peakMemory: number }> {
  // Force GC and get baseline
  forceGC();
  const baseline = getHeapUsed();
  let peakMemory = baseline;

  // Track peak memory during execution
  const intervalId = setInterval(() => {
    const current = getHeapUsed();
    if (current > peakMemory) {
      peakMemory = current;
    }
  }, 1);

  try {
    const result = await fn();

    // Clear interval and get final reading
    clearInterval(intervalId);
    const final = getHeapUsed();

    // Update peak if final is higher
    if (final > peakMemory) {
      peakMemory = final;
    }

    return {
      result,
      memoryDelta: final - baseline,
      peakMemory: peakMemory - baseline,
    };
  } finally {
    clearInterval(intervalId);
  }
}

/**
 * Memory usage snapshot.
 */
export interface MemorySnapshot {
  heapUsed: number;
  heapTotal: number;
  external: number;
  rss: number;
}

/**
 * Get a complete memory snapshot.
 */
export function getMemorySnapshot(): MemorySnapshot {
  const usage = process.memoryUsage();
  return {
    heapUsed: usage.heapUsed,
    heapTotal: usage.heapTotal,
    external: usage.external,
    rss: usage.rss,
  };
}

/**
 * Wait for GC to stabilize before measurement.
 * Runs GC repeatedly until heap usage stabilizes or max attempts reached.
 */
export async function waitForGCStabilization(
  maxAttempts = 5,
  threshold = 0.05,
): Promise<{ stabilized: boolean; attempts: number; finalHeap: number }> {
  forceGC();
  await Bun.sleep(10);

  let prevHeap = getHeapUsed();
  let attempts = 1;

  for (let i = 1; i < maxAttempts; i++) {
    forceGC();
    await Bun.sleep(10);

    const currentHeap = getHeapUsed();
    const change = Math.abs(currentHeap - prevHeap) / prevHeap;

    attempts++;

    if (change < threshold) {
      return { stabilized: true, attempts, finalHeap: currentHeap };
    }

    prevHeap = currentHeap;
  }

  return { stabilized: false, attempts, finalHeap: getHeapUsed() };
}

/**
 * GC metrics from observation.
 */
export interface GCMetrics {
  /** Total time spent in GC (milliseconds) */
  totalTimeMs: number;
  /** Number of GC events */
  count: number;
}

/**
 * CPU usage snapshot.
 */
export interface CpuUsage {
  /** User CPU time in milliseconds */
  user: number;
  /** System CPU time in milliseconds */
  system: number;
}

/**
 * Get current CPU usage.
 */
export function getCpuUsage(): CpuUsage {
  const usage = process.cpuUsage();
  return {
    user: usage.user / 1000, // Convert microseconds to milliseconds
    system: usage.system / 1000,
  };
}

/**
 * Calculate CPU usage delta between two snapshots.
 */
export function calculateCpuDelta(
  start: CpuUsage,
  end: CpuUsage,
): { user: number; system: number; total: number } {
  const user = end.user - start.user;
  const system = end.system - start.system;
  return {
    user,
    system,
    total: user + system,
  };
}

/**
 * GC observer that tracks garbage collection events.
 * Note: This relies on PerformanceObserver which may have limited GC visibility in Bun.
 */
export function createGCObserver(): { start: () => void; stop: () => GCMetrics } {
  let totalTimeMs = 0;
  let count = 0;
  let observer: PerformanceObserver | null = null;

  return {
    start() {
      totalTimeMs = 0;
      count = 0;

      try {
        observer = new PerformanceObserver((list) => {
          for (const entry of list.getEntries()) {
            if (entry.entryType === 'gc') {
              totalTimeMs += entry.duration;
              count++;
            }
          }
        });

        // Try to observe GC entries - may not be available in all runtimes
        try {
          observer.observe({ entryTypes: ['gc'] });
        } catch {
          // GC observation not supported, fall back to estimation
          observer = null;
        }
      } catch {
        // PerformanceObserver not available
        observer = null;
      }
    },

    stop(): GCMetrics {
      if (observer) {
        observer.disconnect();
        observer = null;
      }

      return { totalTimeMs, count };
    },
  };
}
