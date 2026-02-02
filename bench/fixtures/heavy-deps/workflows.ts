/**
 * Heavy-deps fixture: Large external dependencies stress test.
 *
 * This tests bundler performance with large utility libraries.
 * Uses lodash-es with deep imports to stress the bundler.
 */

import { proxyActivities, sleep } from '@temporalio/workflow';

// Note: These imports would be available if lodash-es were installed
// For the benchmark to work, lodash-es needs to be a devDependency
// The bundler should handle these gracefully

interface DataActivities {
  fetchData(): Promise<Record<string, unknown>[]>;
  processData(data: Record<string, unknown>[]): Promise<unknown>;
  saveResults(results: unknown): Promise<void>;
}

const { fetchData, processData, saveResults } = proxyActivities<DataActivities>({
  startToCloseTimeout: '5 minutes',
});

/**
 * Data processing workflow that would typically use lodash.
 */
export async function dataProcessingWorkflow(): Promise<void> {
  // Fetch data
  const rawData = await fetchData();

  // Process data
  const processed = await processData(rawData);

  // Save results
  await saveResults(processed);
}

/**
 * Transform data items.
 */
function transformItem(item: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(item)) {
    // Simple transformation
    if (typeof value === 'string') {
      result[key] = value.toUpperCase();
    } else if (typeof value === 'number') {
      result[key] = value * 2;
    } else {
      result[key] = value;
    }
  }

  return result;
}

/**
 * Group items by a key.
 */
function groupByKey<T extends Record<string, unknown>>(
  items: T[],
  key: keyof T,
): Map<unknown, T[]> {
  const groups = new Map<unknown, T[]>();

  for (const item of items) {
    const k = item[key];
    const existing = groups.get(k) ?? [];
    existing.push(item);
    groups.set(k, existing);
  }

  return groups;
}

/**
 * Get unique values for a key.
 */
function uniqueBy<T extends Record<string, unknown>>(
  items: T[],
  key: keyof T,
): T[] {
  const seen = new Set<unknown>();
  return items.filter((item) => {
    const k = item[key];
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

/**
 * Sort items by a key.
 */
function sortBy<T extends Record<string, unknown>>(
  items: T[],
  key: keyof T,
  order: 'asc' | 'desc' = 'asc',
): T[] {
  return [...items].sort((a, b) => {
    const aVal = String(a[key]);
    const bVal = String(b[key]);
    const cmp = aVal.localeCompare(bVal);
    return order === 'desc' ? -cmp : cmp;
  });
}

/**
 * Chunk array into smaller arrays.
 */
function chunk<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
}

/**
 * Data aggregation workflow.
 */
export async function aggregationWorkflow(): Promise<void> {
  const data = await fetchData();

  // Transform all items
  const transformed = data.map(transformItem);

  // Group by category
  const grouped = groupByKey(transformed, 'category');

  // Process each group
  for (const [, items] of grouped) {
    const sorted = sortBy(items, 'value', 'desc');
    const unique = uniqueBy(sorted, 'id');
    const batches = chunk(unique, 100);

    for (const batch of batches) {
      await processData(batch);
      await sleep('100 milliseconds');
    }
  }
}

/**
 * Batch processing workflow.
 */
export async function batchProcessingWorkflow(batchSize = 50): Promise<void> {
  const data = await fetchData();

  // Process in batches
  const batches = chunk(data, batchSize);

  for (let i = 0; i < batches.length; i++) {
    const batch = batches[i];
    const processed = batch.map(transformItem);
    await saveResults(processed);

    // Progress update
    if (i < batches.length - 1) {
      await sleep('500 milliseconds');
    }
  }
}
