/**
 * Tests for the file loader plugins.
 */

import { join, resolve } from 'node:path';

import { describe, expect, it } from 'bun:test';
import * as esbuild from 'esbuild';

import { type BundlerMode, describeBundlerModes } from '../../test/bundler-modes';
import { bundleWorkflowCode } from '../bundler';
import {
  DEFAULT_MARKDOWN_EXTENSIONS,
  DEFAULT_TEXT_EXTENSIONS,
  DEFAULT_TOML_EXTENSIONS,
  DEFAULT_YAML_EXTENSIONS,
  markdownLoader,
  textLoader,
  tomlLoader,
  yamlLoader,
} from './index';

const fixturesDir = resolve(__dirname, '../../test/fixtures');

describe('plugins', () => {
  describe('textLoader', () => {
    it('has sensible default extensions', () => {
      expect(DEFAULT_TEXT_EXTENSIONS).toContain('.txt');
      expect(DEFAULT_TEXT_EXTENSIONS).toContain('.md');
    });

    it('loads .txt files as strings', async () => {
      const result = await esbuild.build({
        stdin: {
          contents: `import content from './notes.txt'; console.log(content);`,
          resolveDir: join(fixturesDir, 'file-imports'),
          loader: 'js',
        },
        bundle: true,
        write: false,
        format: 'cjs',
        plugins: [textLoader()],
      });

      const output = result.outputFiles[0]!.text;
      expect(output).toContain('plain text file');
      expect(output).toContain('multiple lines');
    });

    it('loads .md files as strings', async () => {
      const result = await esbuild.build({
        stdin: {
          contents: `import content from './readme.md'; console.log(content);`,
          resolveDir: join(fixturesDir, 'file-imports'),
          loader: 'js',
        },
        bundle: true,
        write: false,
        format: 'cjs',
        plugins: [textLoader()],
      });

      const output = result.outputFiles[0]!.text;
      expect(output).toContain('Test Markdown File');
      expect(output).toContain('Feature one');
    });

    it('supports custom extensions', async () => {
      const result = await esbuild.build({
        stdin: {
          contents: `import content from './notes.txt'; console.log(content);`,
          resolveDir: join(fixturesDir, 'file-imports'),
          loader: 'js',
        },
        bundle: true,
        write: false,
        format: 'cjs',
        plugins: [textLoader({ extensions: ['.txt'] })],
      });

      const output = result.outputFiles[0]!.text;
      expect(output).toContain('plain text file');
    });
  });

  describe('markdownLoader', () => {
    it('has sensible default extensions', () => {
      expect(DEFAULT_MARKDOWN_EXTENSIONS).toContain('.md');
    });

    it('loads .md files as strings', async () => {
      const result = await esbuild.build({
        stdin: {
          contents: `import content from './readme.md'; console.log(content);`,
          resolveDir: join(fixturesDir, 'file-imports'),
          loader: 'js',
        },
        bundle: true,
        write: false,
        format: 'cjs',
        plugins: [markdownLoader()],
      });

      const output = result.outputFiles[0]!.text;
      expect(output).toContain('Test Markdown File');
      expect(output).toContain('Feature one');
    });
  });

  describe('tomlLoader', () => {
    it('has sensible default extensions', () => {
      expect(DEFAULT_TOML_EXTENSIONS).toContain('.toml');
    });

    it('loads and parses .toml files', async () => {
      const result = await esbuild.build({
        stdin: {
          contents: `import config from './config.toml'; console.log(JSON.stringify(config));`,
          resolveDir: join(fixturesDir, 'file-imports'),
          loader: 'js',
        },
        bundle: true,
        write: false,
        format: 'cjs',
        plugins: [tomlLoader()],
      });

      const output = result.outputFiles[0]!.text;
      expect(output).toContain('localhost');
      expect(output).toContain('5432');
      expect(output).toContain('database');
      expect(output).toContain('features');
    });
  });

  describe('yamlLoader', () => {
    it('has sensible default extensions', () => {
      expect(DEFAULT_YAML_EXTENSIONS).toContain('.yaml');
      expect(DEFAULT_YAML_EXTENSIONS).toContain('.yml');
    });

    it('loads and parses .yaml files', async () => {
      const result = await esbuild.build({
        stdin: {
          contents: `import data from './data.yaml'; console.log(JSON.stringify(data));`,
          resolveDir: join(fixturesDir, 'file-imports'),
          loader: 'js',
        },
        bundle: true,
        write: false,
        format: 'cjs',
        plugins: [yamlLoader()],
      });

      const output = result.outputFiles[0]!.text;
      expect(output).toContain('Alice');
      expect(output).toContain('admin');
      expect(output).toContain('users');
    });

    it('loads and parses .yml files', async () => {
      const result = await esbuild.build({
        stdin: {
          contents: `import data from './data.yml'; console.log(JSON.stringify(data));`,
          resolveDir: join(fixturesDir, 'file-imports'),
          loader: 'js',
        },
        bundle: true,
        write: false,
        format: 'cjs',
        plugins: [yamlLoader()],
      });

      const output = result.outputFiles[0]!.text;
      expect(output).toContain('items');
      expect(output).toContain('first');
      expect(output).toContain('second');
    });
  });

  describe('combined plugins', () => {
    it('loads all file types in a single build', async () => {
      const result = await esbuild.build({
        stdin: {
          contents: `
            import readme from './readme.md';
            import notes from './notes.txt';
            import config from './config.toml';
            import dataYaml from './data.yaml';
            import dataYml from './data.yml';
            console.log({ readme, notes, config, dataYaml, dataYml });
          `,
          resolveDir: join(fixturesDir, 'file-imports'),
          loader: 'js',
        },
        bundle: true,
        write: false,
        format: 'cjs',
        plugins: [textLoader(), tomlLoader(), yamlLoader()],
      });

      const output = result.outputFiles[0]!.text;

      // Text files
      expect(output).toContain('Test Markdown File');
      expect(output).toContain('plain text file');

      // TOML
      expect(output).toContain('localhost');
      expect(output).toContain('database');

      // YAML
      expect(output).toContain('Alice');
      expect(output).toContain('items');
    });
  });
});

describeBundlerModes('plugins integration', (bundler: BundlerMode) => {
  it('bundles workflow code with static file imports', async () => {
    const bundle = await bundleWorkflowCode({
      workflowsPath: resolve(fixturesDir, 'file-imports/workflows.ts'),
      bundler,
      buildOptions: {
        plugins: [textLoader(), tomlLoader(), yamlLoader()],
      },
    });

    expect(bundle.code).toBeDefined();
    expect(bundle.code).toContain('__TEMPORAL__');

    // Verify static files are embedded in the bundle
    expect(bundle.code).toContain('Test Markdown File');
    expect(bundle.code).toContain('plain text file');
    expect(bundle.code).toContain('localhost'); // from TOML
    expect(bundle.code).toContain('Alice'); // from YAML
  });
});
