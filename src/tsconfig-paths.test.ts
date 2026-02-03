/**
 * Tests for TypeScript path alias support.
 */

import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

import { afterAll, beforeAll, describe, expect, it } from 'bun:test';

import {
  createTsconfigPathsPlugin,
  findTsconfig,
  parseTsconfigPaths,
  resolvePathAlias,
} from './tsconfig-paths';

const testDir = resolve(__dirname, '../test/temp-tsconfig-paths');

describe('tsconfig-paths', () => {
  beforeAll(() => {
    if (!existsSync(testDir)) {
      mkdirSync(testDir, { recursive: true });
    }
  });

  afterAll(() => {
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true });
    }
  });

  describe('findTsconfig', () => {
    it('finds tsconfig.json in the same directory', () => {
      const dir = join(testDir, 'find-same');
      mkdirSync(dir, { recursive: true });
      const tsconfigPath = join(dir, 'tsconfig.json');
      writeFileSync(tsconfigPath, '{}');

      const result = findTsconfig(dir);
      expect(result).toBe(tsconfigPath);
    });

    it('finds tsconfig.json in parent directory', () => {
      const parentDir = join(testDir, 'find-parent');
      const childDir = join(parentDir, 'src');
      mkdirSync(childDir, { recursive: true });
      const tsconfigPath = join(parentDir, 'tsconfig.json');
      writeFileSync(tsconfigPath, '{}');

      const result = findTsconfig(childDir);
      expect(result).toBe(tsconfigPath);
    });

    it('finds tsconfig.json in deeply nested path', () => {
      const baseDir = join(testDir, 'find-nested');
      const deepDir = join(baseDir, 'a', 'b', 'c');
      mkdirSync(deepDir, { recursive: true });
      const tsconfigPath = join(baseDir, 'tsconfig.json');
      writeFileSync(tsconfigPath, '{}');

      const result = findTsconfig(deepDir);
      expect(result).toBe(tsconfigPath);
    });
  });

  describe('parseTsconfigPaths', () => {
    it('parses baseUrl and paths', () => {
      const dir = join(testDir, 'parse-basic');
      mkdirSync(dir, { recursive: true });
      const tsconfigPath = join(dir, 'tsconfig.json');
      writeFileSync(
        tsconfigPath,
        JSON.stringify({
          compilerOptions: {
            baseUrl: '.',
            paths: {
              '@/*': ['./src/*'],
              utils: ['./src/utils/index.ts'],
            },
          },
        }),
      );

      const result = parseTsconfigPaths(tsconfigPath);
      expect(result.baseUrl).toBe(dir);
      expect(result.paths).toEqual({
        '@/*': ['./src/*'],
        utils: ['./src/utils/index.ts'],
      });
    });

    it('handles comments in tsconfig.json', () => {
      const dir = join(testDir, 'parse-comments');
      mkdirSync(dir, { recursive: true });
      const tsconfigPath = join(dir, 'tsconfig.json');
      writeFileSync(
        tsconfigPath,
        `{
          // This is a comment
          "compilerOptions": {
            "baseUrl": ".",
            /* Multi-line
               comment */
            "paths": {
              "@/*": ["./src/*"]
            }
          }
        }`,
      );

      const result = parseTsconfigPaths(tsconfigPath);
      expect(result.paths).toEqual({
        '@/*': ['./src/*'],
      });
    });

    it('handles extends', () => {
      const dir = join(testDir, 'parse-extends');
      mkdirSync(dir, { recursive: true });

      // Create base config
      const baseConfigPath = join(dir, 'tsconfig.base.json');
      writeFileSync(
        baseConfigPath,
        JSON.stringify({
          compilerOptions: {
            baseUrl: '.',
            paths: {
              '@base/*': ['./base/*'],
            },
          },
        }),
      );

      // Create child config that extends base
      const childConfigPath = join(dir, 'tsconfig.json');
      writeFileSync(
        childConfigPath,
        JSON.stringify({
          extends: './tsconfig.base.json',
          compilerOptions: {
            paths: {
              '@/*': ['./src/*'],
            },
          },
        }),
      );

      const result = parseTsconfigPaths(childConfigPath);
      expect(result.paths).toEqual({
        '@base/*': ['./base/*'],
        '@/*': ['./src/*'],
      });
    });

    it('handles trailing commas', () => {
      const dir = join(testDir, 'parse-trailing');
      mkdirSync(dir, { recursive: true });
      const tsconfigPath = join(dir, 'tsconfig.json');
      writeFileSync(
        tsconfigPath,
        `{
          "compilerOptions": {
            "baseUrl": ".",
            "paths": {
              "@/*": ["./src/*"],
            },
          },
        }`,
      );

      const result = parseTsconfigPaths(tsconfigPath);
      expect(result.paths).toEqual({
        '@/*': ['./src/*'],
      });
    });
  });

  describe('resolvePathAlias', () => {
    const baseUrl = '/project';

    it('resolves wildcard patterns', () => {
      const paths = { '@/*': ['./src/*'] };
      const result = resolvePathAlias('@/utils/helper', paths, baseUrl);
      expect(result).toEqual(['/project/src/utils/helper']);
    });

    it('resolves exact matches', () => {
      const paths = { lodash: ['./vendor/lodash.js'] };
      const result = resolvePathAlias('lodash', paths, baseUrl);
      expect(result).toEqual(['/project/vendor/lodash.js']);
    });

    it('returns empty array for non-matching paths', () => {
      const paths = { '@/*': ['./src/*'] };
      const result = resolvePathAlias('lodash', paths, baseUrl);
      expect(result).toEqual([]);
    });

    it('handles multiple replacement paths', () => {
      const paths = { '@/*': ['./src/*', './lib/*'] };
      const result = resolvePathAlias('@/utils', paths, baseUrl);
      expect(result).toEqual(['/project/src/utils', '/project/lib/utils']);
    });

    it('handles patterns without wildcards', () => {
      const paths = { '@': ['./src'] };
      const result = resolvePathAlias('@', paths, baseUrl);
      expect(result).toEqual(['/project/src']);
    });
  });

  describe('createTsconfigPathsPlugin', () => {
    it('creates a plugin with the correct name', () => {
      const plugin = createTsconfigPathsPlugin();
      expect(plugin.name).toBe('temporal-tsconfig-paths');
    });

    it('creates a plugin with a setup function', () => {
      const plugin = createTsconfigPathsPlugin();
      expect(typeof plugin.setup).toBe('function');
    });
  });
});
