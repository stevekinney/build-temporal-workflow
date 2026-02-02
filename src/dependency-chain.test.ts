/**
 * Tests for the dependency chain analysis module.
 */

import { describe, expect, it } from 'bun:test';
import type * as esbuild from 'esbuild';

import {
  buildDependencyGraph,
  findAllDependencyChains,
  findDependencyChain,
  findEntrypoint,
  formatDependencyChain,
  summarizeDependencyChain,
} from './dependency-chain';

// Helper to create a minimal metafile for testing
function createMetafile(
  inputs: Record<
    string,
    {
      imports: Array<{ path: string; kind?: string }>;
      entryPoint?: boolean;
    }
  >,
  entryPoint?: string,
): esbuild.Metafile {
  const metaInputs: esbuild.Metafile['inputs'] = {};

  for (const [path, { imports }] of Object.entries(inputs)) {
    metaInputs[path] = {
      bytes: 100,
      imports: imports.map((imp) => ({
        path: imp.path,
        kind: (imp.kind ?? 'import-statement') as esbuild.ImportKind,
        external: false,
      })),
      format: 'cjs',
    };
  }

  const outputEntry: esbuild.Metafile['outputs'][string] = {
    bytes: 1000,
    inputs: {},
    imports: [],
    exports: [],
  };

  if (entryPoint) {
    outputEntry.entryPoint = entryPoint;
  }

  const outputs: esbuild.Metafile['outputs'] = {
    'out.js': outputEntry,
  };

  return { inputs: metaInputs, outputs };
}

describe('dependency-chain', () => {
  describe('buildDependencyGraph', () => {
    it('builds a graph from metafile', () => {
      const metafile = createMetafile({
        'src/entry.ts': { imports: [{ path: 'src/utils.ts' }] },
        'src/utils.ts': { imports: [{ path: 'src/helpers.ts' }] },
        'src/helpers.ts': { imports: [] },
      });

      const graph = buildDependencyGraph(metafile);

      expect(graph.size).toBe(3);
      // utils.ts is imported by entry.ts
      expect(graph.get('src/utils.ts')).toContain('src/entry.ts');
      // helpers.ts is imported by utils.ts
      expect(graph.get('src/helpers.ts')).toContain('src/utils.ts');
      // entry.ts is not imported by anyone
      expect(graph.get('src/entry.ts')).toEqual([]);
    });

    it('handles multiple importers', () => {
      const metafile = createMetafile({
        'src/a.ts': { imports: [{ path: 'src/shared.ts' }] },
        'src/b.ts': { imports: [{ path: 'src/shared.ts' }] },
        'src/shared.ts': { imports: [] },
      });

      const graph = buildDependencyGraph(metafile);

      const sharedImporters = graph.get('src/shared.ts');
      expect(sharedImporters).toContain('src/a.ts');
      expect(sharedImporters).toContain('src/b.ts');
    });

    it('tracks external modules', () => {
      const metafile = createMetafile({
        'src/entry.ts': { imports: [{ path: 'temporal-forbidden:fs' }] },
      });

      const graph = buildDependencyGraph(metafile);

      // External module should be tracked
      expect(graph.has('temporal-forbidden:fs')).toBe(true);
      expect(graph.get('temporal-forbidden:fs')).toContain('src/entry.ts');
    });
  });

  describe('findEntrypoint', () => {
    it('finds entrypoint from outputs', () => {
      const metafile = createMetafile(
        {
          'src/entry.ts': { imports: [{ path: 'src/utils.ts' }] },
          'src/utils.ts': { imports: [] },
        },
        'src/entry.ts',
      );

      const entrypoint = findEntrypoint(metafile);
      expect(entrypoint).toBe('src/entry.ts');
    });

    it('falls back to module with no importers', () => {
      const metafile = createMetafile({
        'src/entry.ts': { imports: [{ path: 'src/utils.ts' }] },
        'src/utils.ts': { imports: [] },
      });

      // Remove entryPoint from outputs
      delete metafile.outputs['out.js']!.entryPoint;

      const entrypoint = findEntrypoint(metafile);
      expect(entrypoint).toBe('src/entry.ts');
    });

    it('returns undefined for empty metafile', () => {
      const metafile: esbuild.Metafile = { inputs: {}, outputs: {} };
      const entrypoint = findEntrypoint(metafile);
      expect(entrypoint).toBeUndefined();
    });
  });

  describe('findDependencyChain', () => {
    it('finds direct dependency chain', () => {
      const metafile = createMetafile(
        {
          'src/entry.ts': { imports: [{ path: 'src/utils.ts' }] },
          'src/utils.ts': { imports: [{ path: 'temporal-forbidden:fs' }] },
        },
        'src/entry.ts',
      );

      const chain = findDependencyChain(metafile, 'temporal-forbidden:fs');

      expect(chain).toEqual(['src/entry.ts', 'src/utils.ts', 'temporal-forbidden:fs']);
    });

    it('finds shortest path when multiple exist', () => {
      const metafile = createMetafile(
        {
          'src/entry.ts': {
            imports: [{ path: 'src/short.ts' }, { path: 'src/long.ts' }],
          },
          'src/short.ts': { imports: [{ path: 'temporal-forbidden:fs' }] },
          'src/long.ts': { imports: [{ path: 'src/middle.ts' }] },
          'src/middle.ts': { imports: [{ path: 'temporal-forbidden:fs' }] },
        },
        'src/entry.ts',
      );

      const chain = findDependencyChain(metafile, 'temporal-forbidden:fs');

      // Should find the shorter path
      expect(chain).toEqual(['src/entry.ts', 'src/short.ts', 'temporal-forbidden:fs']);
    });

    it('handles deeply nested dependencies', () => {
      const metafile = createMetafile(
        {
          'src/entry.ts': { imports: [{ path: 'src/a.ts' }] },
          'src/a.ts': { imports: [{ path: 'src/b.ts' }] },
          'src/b.ts': { imports: [{ path: 'src/c.ts' }] },
          'src/c.ts': { imports: [{ path: 'src/d.ts' }] },
          'src/d.ts': { imports: [{ path: 'temporal-forbidden:crypto' }] },
        },
        'src/entry.ts',
      );

      const chain = findDependencyChain(metafile, 'temporal-forbidden:crypto');

      expect(chain).toEqual([
        'src/entry.ts',
        'src/a.ts',
        'src/b.ts',
        'src/c.ts',
        'src/d.ts',
        'temporal-forbidden:crypto',
      ]);
    });

    it('returns undefined when no path exists', () => {
      const metafile = createMetafile(
        {
          'src/entry.ts': { imports: [{ path: 'src/utils.ts' }] },
          'src/utils.ts': { imports: [] },
        },
        'src/entry.ts',
      );

      const chain = findDependencyChain(metafile, 'non-existent-module');

      expect(chain).toBeUndefined();
    });

    it('handles circular dependencies', () => {
      const metafile = createMetafile(
        {
          'src/entry.ts': { imports: [{ path: 'src/a.ts' }] },
          'src/a.ts': { imports: [{ path: 'src/b.ts' }] },
          'src/b.ts': {
            imports: [{ path: 'src/a.ts' }, { path: 'temporal-forbidden:fs' }],
          },
        },
        'src/entry.ts',
      );

      const chain = findDependencyChain(metafile, 'temporal-forbidden:fs');

      // Should not get stuck in infinite loop
      expect(chain).toEqual([
        'src/entry.ts',
        'src/a.ts',
        'src/b.ts',
        'temporal-forbidden:fs',
      ]);
    });

    it('finds node_modules paths', () => {
      const metafile = createMetafile(
        {
          'src/entry.ts': {
            imports: [{ path: 'node_modules/some-lib/index.js' }],
          },
          'node_modules/some-lib/index.js': {
            imports: [{ path: 'temporal-forbidden:net' }],
          },
        },
        'src/entry.ts',
      );

      const chain = findDependencyChain(metafile, 'temporal-forbidden:net');

      expect(chain).toEqual([
        'src/entry.ts',
        'node_modules/some-lib/index.js',
        'temporal-forbidden:net',
      ]);
    });
  });

  describe('findAllDependencyChains', () => {
    it('finds chains for multiple modules', () => {
      const metafile = createMetafile(
        {
          'src/entry.ts': {
            imports: [{ path: 'src/a.ts' }, { path: 'src/b.ts' }],
          },
          'src/a.ts': { imports: [{ path: 'temporal-forbidden:fs' }] },
          'src/b.ts': { imports: [{ path: 'temporal-forbidden:crypto' }] },
        },
        'src/entry.ts',
      );

      const targetModules = new Map([
        ['temporal-forbidden:fs', 'src/a.ts'],
        ['temporal-forbidden:crypto', 'src/b.ts'],
      ]);

      const chains = findAllDependencyChains(metafile, targetModules);

      expect(chains.get('temporal-forbidden:fs')).toEqual([
        'src/entry.ts',
        'src/a.ts',
        'temporal-forbidden:fs',
      ]);

      expect(chains.get('temporal-forbidden:crypto')).toEqual([
        'src/entry.ts',
        'src/b.ts',
        'temporal-forbidden:crypto',
      ]);
    });
  });

  describe('formatDependencyChain', () => {
    it('simplifies node_modules paths', () => {
      const chain = [
        'src/entry.ts',
        'node_modules/some-lib/dist/index.js',
        'temporal-forbidden:fs',
      ];

      const formatted = formatDependencyChain(chain);

      expect(formatted).toEqual([
        'src/entry.ts',
        'some-lib/dist/index.js',
        'fs (forbidden)',
      ]);
    });

    it('handles namespace paths', () => {
      const chain = ['src/entry.ts', 'temporal-forbidden:crypto'];

      const formatted = formatDependencyChain(chain);

      expect(formatted).toEqual(['src/entry.ts', 'crypto (forbidden)']);
    });

    it('handles ignored namespace', () => {
      const chain = ['src/entry.ts', 'temporal-ignored:some-module'];

      const formatted = formatDependencyChain(chain);

      expect(formatted).toEqual(['src/entry.ts', 'some-module (ignored)']);
    });

    it('removes ./ prefix', () => {
      const chain = ['./src/entry.ts', './src/utils.ts'];

      const formatted = formatDependencyChain(chain);

      expect(formatted).toEqual(['src/entry.ts', 'src/utils.ts']);
    });

    it('preserves normal paths', () => {
      const chain = ['src/entry.ts', 'src/utils.ts', 'src/helpers.ts'];

      const formatted = formatDependencyChain(chain);

      expect(formatted).toEqual(['src/entry.ts', 'src/utils.ts', 'src/helpers.ts']);
    });
  });

  describe('summarizeDependencyChain', () => {
    it('creates arrow-separated summary', () => {
      const chain = [
        'src/entry.ts',
        'node_modules/bad-lib/index.js',
        'temporal-forbidden:fs',
      ];

      const summary = summarizeDependencyChain(chain);

      expect(summary).toBe('src/entry.ts → bad-lib/index.js → fs (forbidden)');
    });

    it('handles single item', () => {
      const chain = ['src/entry.ts'];

      const summary = summarizeDependencyChain(chain);

      expect(summary).toBe('src/entry.ts');
    });

    it('handles empty chain', () => {
      const chain: string[] = [];

      const summary = summarizeDependencyChain(chain);

      expect(summary).toBe('');
    });
  });
});
