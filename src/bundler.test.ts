/**
 * Tests for the WorkflowCodeBundler.
 */

import { resolve } from 'node:path';
import { createContext, Script } from 'node:vm';

import { describe, expect, it } from 'bun:test';

import { describeBundlerModes } from '../test/bundler-modes';
import { bundleWorkflowCode, WorkflowCodeBundler } from './bundler';
import { WorkflowBundleError } from './errors';

const fixturesDir = resolve(__dirname, '../test/fixtures');

describeBundlerModes('WorkflowCodeBundler', (bundler) => {
  describe('basic bundling', () => {
    it('creates a bundle from workflow path', async () => {
      const bundle = await bundleWorkflowCode({
        workflowsPath: resolve(fixturesDir, 'basic-workflow/workflows.ts'),
        bundler,
      });

      expect(bundle.code).toBeDefined();
      expect(typeof bundle.code).toBe('string');
      expect(bundle.code.length).toBeGreaterThan(0);
    });

    it('includes __TEMPORAL__ in output', async () => {
      const bundle = await bundleWorkflowCode({
        workflowsPath: resolve(fixturesDir, 'basic-workflow/workflows.ts'),
        bundler,
      });

      expect(bundle.code).toContain('__TEMPORAL__');
    });

    it('includes __webpack_module_cache__ reference', async () => {
      const bundle = await bundleWorkflowCode({
        workflowsPath: resolve(fixturesDir, 'basic-workflow/workflows.ts'),
        bundler,
      });

      expect(bundle.code).toContain('__webpack_module_cache__');
    });

    it('includes metadata when report is true', async () => {
      const bundle = await bundleWorkflowCode({
        workflowsPath: resolve(fixturesDir, 'basic-workflow/workflows.ts'),
        report: true,
        bundler,
      });

      expect(bundle.metadata).toBeDefined();
      expect(bundle.metadata?.createdAt).toBeDefined();
      expect(bundle.metadata?.mode).toBe('development');
      expect(bundle.metadata?.entryHash).toBeDefined();
      expect(bundle.metadata?.bundlerVersion).toBeDefined();
    });

    it('excludes metadata when report is false', async () => {
      const bundle = await bundleWorkflowCode({
        workflowsPath: resolve(fixturesDir, 'basic-workflow/workflows.ts'),
        report: false,
        bundler,
      });

      expect(bundle.metadata).toBeUndefined();
    });
  });

  describe('bundle evaluation', () => {
    /**
     * Create a VM context that mimics the Temporal workflow isolate.
     * The real isolate has more globals, but these are the essentials.
     */
    function createWorkflowVmContext() {
      // This object becomes both `globalThis` and the context
      const sandbox: Record<string, unknown> = {
        __webpack_module_cache__: {},
        // Mock assert for the stub
        assert: (value: unknown, message?: string) => {
          if (!value) throw new Error(message || 'Assertion failed');
        },
        console,
        URL,
        URLSearchParams,
        TextEncoder,
        TextDecoder,
        Date,
        Math,
        Object,
        Array,
        String,
        Number,
        Boolean,
        Error,
        TypeError,
        RangeError,
        ReferenceError,
        SyntaxError,
        JSON,
        Promise,
        Map,
        Set,
        WeakMap,
        WeakSet,
        Symbol,
        Reflect,
        Proxy,
        Int8Array,
        Uint8Array,
        Uint8ClampedArray,
        Int16Array,
        Uint16Array,
        Int32Array,
        Uint32Array,
        Float32Array,
        Float64Array,
        BigInt64Array,
        BigUint64Array,
        ArrayBuffer,
        SharedArrayBuffer,
        DataView,
        setTimeout: globalThis.setTimeout,
        clearTimeout: globalThis.clearTimeout,
        setInterval: globalThis.setInterval,
        clearInterval: globalThis.clearInterval,
        queueMicrotask: globalThis.queueMicrotask,
      };

      // Make globalThis point to the sandbox itself
      sandbox['globalThis'] = sandbox;
      sandbox['global'] = sandbox;

      return createContext(sandbox);
    }

    it('bundle can be evaluated in vm', async () => {
      const bundle = await bundleWorkflowCode({
        workflowsPath: resolve(fixturesDir, 'basic-workflow/workflows.ts'),
        bundler,
      });

      const context = createWorkflowVmContext();
      const script = new Script(bundle.code);
      expect(() => script.runInContext(context)).not.toThrow();
    });

    it('creates correct __TEMPORAL__ shape', async () => {
      const bundle = await bundleWorkflowCode({
        workflowsPath: resolve(fixturesDir, 'basic-workflow/workflows.ts'),
        bundler,
      });

      const context = createWorkflowVmContext();
      const script = new Script(bundle.code);
      script.runInContext(context);

      const temporal = (context as any).__TEMPORAL__;
      expect(temporal).toBeDefined();
      expect(temporal.api).toBeDefined();
      expect(typeof temporal.importWorkflows).toBe('function');
      expect(typeof temporal.importInterceptors).toBe('function');
    });
  });

  describe('forbidden modules', () => {
    it('fails when workflow imports forbidden module', async () => {
      // eslint-disable-next-line @typescript-eslint/await-thenable -- Bun's expect().rejects returns a Promise
      await expect(
        bundleWorkflowCode({
          workflowsPath: resolve(fixturesDir, 'forbidden-import/workflows.ts'),
          bundler,
        }),
      ).rejects.toThrow(WorkflowBundleError);
    });

    it('error has FORBIDDEN_MODULES code', async () => {
      try {
        await bundleWorkflowCode({
          workflowsPath: resolve(fixturesDir, 'forbidden-import/workflows.ts'),
          bundler,
        });
        expect.unreachable('Should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(WorkflowBundleError);
        expect((error as WorkflowBundleError).code).toBe('FORBIDDEN_MODULES');
      }
    });

    it('error includes module name in context', async () => {
      try {
        await bundleWorkflowCode({
          workflowsPath: resolve(fixturesDir, 'forbidden-import/workflows.ts'),
          bundler,
        });
        expect.unreachable('Should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(WorkflowBundleError);
        const bundleError = error as WorkflowBundleError;
        expect(bundleError.context.modules).toContain('fs');
      }
    });

    it.skipIf(bundler === 'bun')(
      'error includes dependency chain in context',
      async () => {
        try {
          await bundleWorkflowCode({
            workflowsPath: resolve(fixturesDir, 'forbidden-import/workflows.ts'),
            bundler,
          });
          expect.unreachable('Should have thrown');
        } catch (error) {
          expect(error).toBeInstanceOf(WorkflowBundleError);
          const bundleError = error as WorkflowBundleError;
          // The error should have a dependency chain showing the path to the forbidden module
          expect(bundleError.context.dependencyChain).toBeDefined();
          expect(bundleError.context.dependencyChain?.length).toBeGreaterThan(0);
        }
      },
    );

    it.skipIf(bundler === 'bun')('error message shows dependency chain', async () => {
      try {
        await bundleWorkflowCode({
          workflowsPath: resolve(fixturesDir, 'forbidden-import/workflows.ts'),
          bundler,
        });
        expect.unreachable('Should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(WorkflowBundleError);
        const bundleError = error as WorkflowBundleError;
        // The formatted error message should contain "Dependency chain:"
        expect(bundleError.message).toContain('Dependency chain:');
        // And should show the arrow format
        expect(bundleError.message).toContain('→');
      }
    });
  });

  describe('ignored modules', () => {
    it('allows ignored modules to be bundled', async () => {
      const bundle = await bundleWorkflowCode({
        workflowsPath: resolve(fixturesDir, 'forbidden-import/workflows.ts'),
        ignoreModules: ['fs'],
        bundler,
      });

      expect(bundle.code).toBeDefined();
    });

    it('ignored modules throw at runtime', async () => {
      const bundle = await bundleWorkflowCode({
        workflowsPath: resolve(fixturesDir, 'forbidden-import/workflows.ts'),
        ignoreModules: ['fs'],
        bundler,
      });

      // Bundle should contain runtime throwing stub
      expect(bundle.code).toContain('was ignored during bundling');
    });
  });

  describe('interceptors', () => {
    it('bundles with interceptor modules', async () => {
      const bundle = await bundleWorkflowCode({
        workflowsPath: resolve(fixturesDir, 'with-interceptors/workflows.ts'),
        workflowInterceptorModules: [
          resolve(fixturesDir, 'with-interceptors/interceptors.ts'),
        ],
        bundler,
      });

      expect(bundle.code).toBeDefined();
      expect(bundle.code).toContain('interceptors.ts');
    });
  });

  describe('node: prefix imports', () => {
    it('handles node: prefixed imports for allowed builtins', async () => {
      const bundle = await bundleWorkflowCode({
        workflowsPath: resolve(fixturesDir, 'node-prefix-imports/workflows.ts'),
        bundler,
      });

      expect(bundle.code).toBeDefined();
      // Should have resolved to stubs
      expect(bundle.code).toContain('module-overrides');
    });
  });

  describe('configuration validation', () => {
    it.skipIf(bundler === 'bun')('throws for minify: true', async () => {
      // eslint-disable-next-line @typescript-eslint/await-thenable -- Bun's expect().rejects returns a Promise
      await expect(
        bundleWorkflowCode({
          workflowsPath: resolve(fixturesDir, 'basic-workflow/workflows.ts'),
          buildOptions: { minify: true },
          bundler,
        }),
      ).rejects.toThrow(WorkflowBundleError);
    });

    it.skipIf(bundler === 'bun')('throws for format: esm', async () => {
      // eslint-disable-next-line @typescript-eslint/await-thenable -- Bun's expect().rejects returns a Promise
      await expect(
        bundleWorkflowCode({
          workflowsPath: resolve(fixturesDir, 'basic-workflow/workflows.ts'),
          buildOptions: { format: 'esm' },
          bundler,
        }),
      ).rejects.toThrow(WorkflowBundleError);
    });

    it('throws for non-existent workflows path', async () => {
      // eslint-disable-next-line @typescript-eslint/await-thenable -- Bun's expect().rejects returns a Promise
      await expect(
        bundleWorkflowCode({
          workflowsPath: '/non/existent/path.ts',
          bundler,
        }),
      ).rejects.toThrow(WorkflowBundleError);
    });
  });

  describe('tree shaking', () => {
    it('enables tree shaking by default', async () => {
      const bundle = await bundleWorkflowCode({
        workflowsPath: resolve(fixturesDir, 'basic-workflow/workflows.ts'),
        bundler,
      });

      expect(bundle.code).toBeDefined();
      expect(bundle.code).toContain('__TEMPORAL__');
    });

    it('produces a valid bundle with treeShaking: false', async () => {
      const bundle = await bundleWorkflowCode({
        workflowsPath: resolve(fixturesDir, 'basic-workflow/workflows.ts'),
        treeShaking: false,
        bundler,
      });

      expect(bundle.code).toBeDefined();
      expect(bundle.code).toContain('__TEMPORAL__');
    });
  });

  describe('source maps', () => {
    it('includes inline source map by default', async () => {
      const bundle = await bundleWorkflowCode({
        workflowsPath: resolve(fixturesDir, 'basic-workflow/workflows.ts'),
        bundler,
      });

      expect(bundle.code).toContain('//# sourceMappingURL=data:');
    });

    it('keeps inline source map as the final non-whitespace bundle content', async () => {
      const bundle = await bundleWorkflowCode({
        workflowsPath: resolve(fixturesDir, 'basic-workflow/workflows.ts'),
        bundler,
      });

      const trimmed = bundle.code.trimEnd();
      const sourceMapDirectiveIndex = trimmed.lastIndexOf('//# sourceMappingURL=data:');

      expect(sourceMapDirectiveIndex).toBeGreaterThan(-1);
      const trailingText = trimmed
        .slice(sourceMapDirectiveIndex)
        .split('\n')
        .slice(1)
        .join('\n')
        .trim();
      expect(trailingText).toBe('');
    });

    it('excludes source map when sourceMap: none', async () => {
      const bundle = await bundleWorkflowCode({
        workflowsPath: resolve(fixturesDir, 'basic-workflow/workflows.ts'),
        sourceMap: 'none',
        bundler,
      });

      expect(bundle.code).not.toContain('//# sourceMappingURL=');
    });

    it('returns external source map when sourceMap: external', async () => {
      const bundle = await bundleWorkflowCode({
        workflowsPath: resolve(fixturesDir, 'basic-workflow/workflows.ts'),
        sourceMap: 'external',
        bundler,
      });

      expect(bundle.sourceMap).toBeDefined();
      expect(typeof bundle.sourceMap).toBe('string');
    });
  });

  describe('bundler plugins', () => {
    it('applies plugin configuration', async () => {
      const bundle = await bundleWorkflowCode({
        workflowsPath: resolve(fixturesDir, 'basic-workflow/workflows.ts'),
        plugins: [
          {
            name: 'test-plugin',
            configureBundler(options) {
              return {
                ...options,
                mode: 'production',
              };
            },
          },
        ],
        bundler,
      });

      expect(bundle.metadata?.mode).toBe('production');
    });
  });

  describe('transitive forbidden modules', () => {
    it('detects forbidden modules imported through helper modules', async () => {
      try {
        await bundleWorkflowCode({
          workflowsPath: resolve(fixturesDir, 'transitive-forbidden/workflows.ts'),
          bundler,
        });
        expect.unreachable('Should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(WorkflowBundleError);
        const bundleError = error as WorkflowBundleError;
        expect(bundleError.code).toBe('FORBIDDEN_MODULES');
        expect(bundleError.context.modules).toContain('dns');
      }
    });

    it('allows transitive forbidden modules with ignoreModules', async () => {
      const bundle = await bundleWorkflowCode({
        workflowsPath: resolve(fixturesDir, 'transitive-forbidden/workflows.ts'),
        ignoreModules: ['dns'],
        bundler,
      });

      expect(bundle.code).toBeDefined();
    });
  });

  describe('type-only imports', () => {
    it('allows type-only imports of forbidden modules', async () => {
      const bundle = await bundleWorkflowCode({
        workflowsPath: resolve(fixturesDir, 'type-only-imports/workflows.ts'),
        bundler,
      });

      expect(bundle.code).toBeDefined();
    });

    it('bundle from type-only imports evaluates in vm', async () => {
      const bundle = await bundleWorkflowCode({
        workflowsPath: resolve(fixturesDir, 'type-only-imports/workflows.ts'),
        bundler,
      });

      const sandbox: Record<string, unknown> = {
        __webpack_module_cache__: {},
        assert: (value: unknown, message?: string) => {
          if (!value) throw new Error(message || 'Assertion failed');
        },
        console,
        URL,
        URLSearchParams,
        TextEncoder,
        TextDecoder,
        Date,
        Math,
        Object,
        Array,
        String,
        Number,
        Boolean,
        Error,
        TypeError,
        RangeError,
        ReferenceError,
        SyntaxError,
        JSON,
        Promise,
        Map,
        Set,
        WeakMap,
        WeakSet,
        Symbol,
        Reflect,
        Proxy,
        Int8Array,
        Uint8Array,
        Uint8ClampedArray,
        Int16Array,
        Uint16Array,
        Int32Array,
        Uint32Array,
        Float32Array,
        Float64Array,
        BigInt64Array,
        BigUint64Array,
        ArrayBuffer,
        SharedArrayBuffer,
        DataView,
        setTimeout: globalThis.setTimeout,
        clearTimeout: globalThis.clearTimeout,
        setInterval: globalThis.setInterval,
        clearInterval: globalThis.clearInterval,
        queueMicrotask: globalThis.queueMicrotask,
      };
      sandbox['globalThis'] = sandbox;
      sandbox['global'] = sandbox;

      const context = createContext(sandbox);
      const script = new Script(bundle.code);
      script.runInContext(context);

      expect((context as any).__TEMPORAL__).toBeDefined();
    });
  });

  describe('dynamic imports', () => {
    it('detects dynamic import() expressions', async () => {
      try {
        await bundleWorkflowCode({
          workflowsPath: resolve(fixturesDir, 'dynamic-import/workflows.ts'),
          bundler,
        });
        expect.unreachable('Should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(WorkflowBundleError);
        expect((error as WorkflowBundleError).code).toBe('DYNAMIC_IMPORT');
      }
    });
  });

  describe('createContext', () => {
    it.skipIf(bundler === 'bun')('rebuild produces valid bundle', async () => {
      const ctx_bundler = new WorkflowCodeBundler({
        workflowsPath: resolve(fixturesDir, 'basic-workflow/workflows.ts'),
        bundler,
      });
      const ctx = await ctx_bundler.createContext();

      try {
        const bundle = await ctx.rebuild();
        expect(bundle.code).toContain('__TEMPORAL__');
        expect(bundle.code).toContain('__webpack_module_cache__');
      } finally {
        await ctx.dispose();
      }
    });

    it.skipIf(bundler === 'bun')('dispose cleans up without error', async () => {
      const ctx_bundler = new WorkflowCodeBundler({
        workflowsPath: resolve(fixturesDir, 'basic-workflow/workflows.ts'),
        bundler,
      });
      const ctx = await ctx_bundler.createContext();
      // eslint-disable-next-line @typescript-eslint/await-thenable -- Bun's expect().resolves returns a Promise
      await expect(ctx.dispose()).resolves.toBeUndefined();
    });
  });

  describe('cross-runtime support', () => {
    it('bundles with Deno-style import map', async () => {
      const bundle = await bundleWorkflowCode({
        workflowsPath: resolve(fixturesDir, 'deno-style/workflows.ts'),
        denoConfigPath: resolve(fixturesDir, 'deno-style/deno.json'),
        bundler,
      });

      expect(bundle.code).toBeDefined();
      expect(bundle.code.length).toBeGreaterThan(0);
      // The helper should be bundled
      expect(bundle.code).toContain('formatGreeting');
    });

    it('auto-detects Deno flavor from deno.json', async () => {
      const bundle = await bundleWorkflowCode({
        workflowsPath: resolve(fixturesDir, 'deno-style/workflows.ts'),
        inputFlavor: 'auto',
        bundler,
      });

      expect(bundle.code).toBeDefined();
      // The helper should be bundled via import map
      expect(bundle.code).toContain('formatGreeting');
    });

    it('bundles with explicit node flavor', async () => {
      // Basic workflow should work with node flavor
      const bundle = await bundleWorkflowCode({
        workflowsPath: resolve(fixturesDir, 'basic-workflow/workflows.ts'),
        inputFlavor: 'node',
        bundler,
      });

      expect(bundle.code).toBeDefined();
      expect(bundle.code).toContain('__TEMPORAL__');
    });
  });
});
