/**
 * Persistent disk cache for workflow bundles.
 *
 * Stores built bundles on disk to avoid redundant builds across process
 * restarts. Uses content hashing for cache keys and supports TTL-based
 * and size-based eviction.
 */

import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { join, resolve } from 'node:path';

import type { DiskCacheOptions, WorkflowBundle } from './types';

const DEFAULT_CACHE_DIR = 'node_modules/.cache/temporal-bundler';
const DEFAULT_MAX_AGE = 7 * 24 * 60 * 60 * 1000; // 7 days
const DEFAULT_MAX_SIZE = 100 * 1024 * 1024; // 100 MB

interface CacheEntry {
  bundle: {
    code: string;
    sourceMap?: string;
    metadata?: WorkflowBundle['metadata'];
  };
  contentHash: string;
  createdAt: number;
}

/**
 * Persistent disk cache for workflow bundles.
 */
export class DiskCache {
  readonly cacheDir: string;
  readonly maxAge: number;
  readonly maxSize: number;

  constructor(options: DiskCacheOptions = {}) {
    this.cacheDir = resolve(options.cacheDir ?? DEFAULT_CACHE_DIR);
    this.maxAge = options.maxAge ?? DEFAULT_MAX_AGE;
    this.maxSize = options.maxSize ?? DEFAULT_MAX_SIZE;
  }

  /**
   * Get a cached bundle by its content hash.
   *
   * @returns The cached bundle, or undefined if not found or expired.
   */
  get(contentHash: string): WorkflowBundle | undefined {
    const entryPath = this.entryPath(contentHash);

    if (!existsSync(entryPath)) {
      return undefined;
    }

    try {
      const raw = readFileSync(entryPath, 'utf-8');
      const entry = JSON.parse(raw) as CacheEntry;

      // Check TTL
      if (Date.now() - entry.createdAt > this.maxAge) {
        this.delete(contentHash);
        return undefined;
      }

      return entry.bundle;
    } catch {
      // Corrupted entry - remove it
      this.delete(contentHash);
      return undefined;
    }
  }

  /**
   * Store a bundle in the cache.
   */
  set(contentHash: string, bundle: WorkflowBundle): void {
    this.ensureCacheDir();

    const entry: CacheEntry = {
      bundle: {
        code: bundle.code,
        ...(bundle.sourceMap !== undefined && { sourceMap: bundle.sourceMap }),
        ...(bundle.metadata !== undefined && { metadata: bundle.metadata }),
      },
      contentHash,
      createdAt: Date.now(),
    };

    const entryPath = this.entryPath(contentHash);
    writeFileSync(entryPath, JSON.stringify(entry));

    // Evict if over size limit
    this.evictIfNeeded();
  }

  /**
   * Check if a cache entry exists and is not expired.
   */
  has(contentHash: string): boolean {
    return this.get(contentHash) !== undefined;
  }

  /**
   * Delete a cache entry.
   */
  delete(contentHash: string): void {
    const entryPath = this.entryPath(contentHash);
    if (existsSync(entryPath)) {
      unlinkSync(entryPath);
    }
  }

  /**
   * Clear all cache entries.
   */
  clear(): void {
    if (!existsSync(this.cacheDir)) {
      return;
    }

    const entries = readdirSync(this.cacheDir);
    for (const entry of entries) {
      if (entry.endsWith('.json')) {
        unlinkSync(join(this.cacheDir, entry));
      }
    }
  }

  /**
   * Get cache statistics.
   */
  stats(): { entryCount: number; totalSize: number } {
    if (!existsSync(this.cacheDir)) {
      return { entryCount: 0, totalSize: 0 };
    }

    const entries = readdirSync(this.cacheDir).filter((e) => e.endsWith('.json'));
    let totalSize = 0;

    for (const entry of entries) {
      try {
        const stat = statSync(join(this.cacheDir, entry));
        totalSize += stat.size;
      } catch {
        // Ignore stat errors
      }
    }

    return { entryCount: entries.length, totalSize };
  }

  /**
   * Evict oldest entries if cache exceeds size limit.
   */
  private evictIfNeeded(): void {
    if (!existsSync(this.cacheDir)) {
      return;
    }

    const entries = readdirSync(this.cacheDir)
      .filter((e) => e.endsWith('.json'))
      .map((name) => {
        const fullPath = join(this.cacheDir, name);
        const stat = statSync(fullPath);
        return { name, path: fullPath, size: stat.size, mtime: stat.mtimeMs };
      })
      .sort((a, b) => a.mtime - b.mtime); // Oldest first

    let totalSize = entries.reduce((sum, e) => sum + e.size, 0);

    // Remove oldest entries until under the limit
    for (const entry of entries) {
      if (totalSize <= this.maxSize) {
        break;
      }
      unlinkSync(entry.path);
      totalSize -= entry.size;
    }
  }

  private entryPath(contentHash: string): string {
    return join(this.cacheDir, `${contentHash}.json`);
  }

  private ensureCacheDir(): void {
    if (!existsSync(this.cacheDir)) {
      mkdirSync(this.cacheDir, { recursive: true });
    }
  }
}

/**
 * Create a disk cache with the given options.
 */
export function createDiskCache(options?: DiskCacheOptions): DiskCache {
  return new DiskCache(options);
}
