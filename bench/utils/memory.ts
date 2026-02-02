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
