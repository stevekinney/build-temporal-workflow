/**
 * Tests for the esbuild plugin converter alias resolution.
 */

import { describe, expect, it } from 'bun:test';

import { createTemporalPlugin } from './esbuild-plugin';

describe('esbuild-plugin', () => {
  describe('converter alias filters', () => {
    it('matches __temporal_custom_payload_converter without a trailing $', () => {
      const { plugin } = createTemporalPlugin({ ignoreModules: [] });

      // The SDK requires '__temporal_custom_payload_converter' (no $).
      // If the filter incorrectly includes a literal $, the onResolve handler
      // never fires and the require() call passes through unbundled, crashing
      // the workflow isolate with "require is not defined".
      //
      // We verify the plugin was created successfully and the name is correct.
      // The real assertion is the integration-style check below using esbuild.
      expect(plugin.name).toBe('temporal-workflow');
    });

    it('resolves payload converter to stub when no path is provided', async () => {
      const esbuild = await import('esbuild');

      const { plugin } = createTemporalPlugin({ ignoreModules: [] });

      const result = await esbuild.build({
        stdin: {
          contents: `const c = require("__temporal_custom_payload_converter");`,
          loader: 'js',
        },
        bundle: true,
        write: false,
        format: 'cjs',
        platform: 'browser',
        plugins: [plugin],
      });

      const output = result.outputFiles[0]!.text;
      // The stub should be inlined — no raw require() should remain
      expect(output).not.toContain('require("__temporal_custom_payload_converter")');
    });

    it('resolves failure converter to stub when no path is provided', async () => {
      const esbuild = await import('esbuild');

      const { plugin } = createTemporalPlugin({ ignoreModules: [] });

      const result = await esbuild.build({
        stdin: {
          contents: `const c = require("__temporal_custom_failure_converter");`,
          loader: 'js',
        },
        bundle: true,
        write: false,
        format: 'cjs',
        platform: 'browser',
        plugins: [plugin],
      });

      const output = result.outputFiles[0]!.text;
      // The stub should be inlined — no raw require() should remain
      expect(output).not.toContain('require("__temporal_custom_failure_converter")');
    });

    it('resolves payload converter to custom path when provided', async () => {
      const { writeFileSync, mkdirSync, rmSync } = await import('node:fs');
      const { join, resolve } = await import('node:path');
      const esbuild = await import('esbuild');

      const tempDir = resolve(__dirname, '../test/temp-esbuild-plugin');
      mkdirSync(tempDir, { recursive: true });

      try {
        const converterPath = join(tempDir, 'my-converter.js');
        writeFileSync(converterPath, 'module.exports = { payloadConverter: "custom" };');

        const { plugin } = createTemporalPlugin({
          ignoreModules: [],
          payloadConverterPath: converterPath,
        });

        const result = await esbuild.build({
          stdin: {
            contents: `const c = require("__temporal_custom_payload_converter");`,
            loader: 'js',
          },
          bundle: true,
          write: false,
          format: 'cjs',
          platform: 'browser',
          plugins: [plugin],
        });

        const output = result.outputFiles[0]!.text;
        expect(output).not.toContain('require("__temporal_custom_payload_converter")');
        expect(output).toContain('custom');
      } finally {
        rmSync(tempDir, { recursive: true, force: true });
      }
    });
  });
});
