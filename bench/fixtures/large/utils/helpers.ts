/**
 * General helper utilities for large fixture.
 */

import type { PaginatedResult, PaginationParams } from '../types';

export function generateId(prefix = ''): string {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 10);
  return prefix ? `${prefix}_${timestamp}${random}` : `${timestamp}${random}`;
}

export function generateOrderNumber(): string {
  const date = new Date();
  const year = date.getFullYear().toString().slice(-2);
  const month = (date.getMonth() + 1).toString().padStart(2, '0');
  const day = date.getDate().toString().padStart(2, '0');
  const random = Math.random().toString(36).substring(2, 6).toUpperCase();
  return `ORD-${year}${month}${day}-${random}`;
}

export function paginate<T>(items: T[], params: PaginationParams): PaginatedResult<T> {
  const { page, pageSize, sortBy, sortOrder = 'asc' } = params;

  const sorted = [...items];
  if (sortBy) {
    sorted.sort((a, b) => {
      const aVal = (a as Record<string, unknown>)[sortBy];
      const bVal = (b as Record<string, unknown>)[sortBy];
      const cmp = String(aVal).localeCompare(String(bVal));
      return sortOrder === 'desc' ? -cmp : cmp;
    });
  }

  const start = (page - 1) * pageSize;
  const paged = sorted.slice(start, start + pageSize);

  return {
    items: paged,
    total: items.length,
    page,
    pageSize,
    hasMore: start + pageSize < items.length,
  };
}

export function groupBy<T>(items: T[], key: keyof T): Map<unknown, T[]> {
  const groups = new Map<unknown, T[]>();
  for (const item of items) {
    const k = item[key];
    const existing = groups.get(k) ?? [];
    existing.push(item);
    groups.set(k, existing);
  }
  return groups;
}

export function unique<T>(items: T[], key?: keyof T): T[] {
  if (!key) return [...new Set(items)];
  const seen = new Set<unknown>();
  return items.filter((item) => {
    const k = item[key];
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

export function chunk<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
}

export function shuffle<T>(items: T[]): T[] {
  const shuffled = [...items];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function retry<T>(
  fn: () => Promise<T>,
  maxAttempts: number,
  delayMs: number,
): Promise<T> {
  try {
    return await fn();
  } catch (error) {
    if (maxAttempts <= 1) throw error;
    await sleep(delayMs);
    return retry(fn, maxAttempts - 1, delayMs);
  }
}
