/**
 * Tests for the WorkflowCodeBundler.
 */

import { resolve } from 'node:path';
import { createContext, Script } from 'node:vm';

import { describe, expect, it } from 'bun:test';

import { bundleWorkflowCode } from './bundler';
import { WorkflowBundleError } from './errors';

const fixturesDir = resolve(__dirname, '../test/fixtures');

describe('WorkflowCodeBundler', () => {
  describe('basic bundling', () => {
    it('creates a bundle from workflow path', async () => {
      const bundle = await bundleWorkflowCode({
        workflowsPath: resolve(fixturesDir, 'basic-workflow/workflows.ts'),
      });

      expect(bundle.code).toBeDefined();
      expect(typeof bundle.code).toBe('string');
      expect(bundle.code.length).toBeGreaterThan(0);
    });

    it('includes __TEMPORAL__ in output', async () => {
      const bundle = await bundleWorkflowCode({
        workflowsPath: resolve(fixturesDir, 'basic-workflow/workflows.ts'),
      });

      expect(bundle.code).toContain('__TEMPORAL__');
    });

    it('includes __webpack_module_cache__ reference', async () => {
      const bundle = await bundleWorkflowCode({
        workflowsPath: resolve(fixturesDir, 'basic-workflow/workflows.ts'),
      });

      expect(bundle.code).toContain('__webpack_module_cache__');
    });

    it('includes metadata when report is true', async () => {
      const bundle = await bundleWorkflowCode({
        workflowsPath: resolve(fixturesDir, 'basic-workflow/workflows.ts'),
        report: true,
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
      });

      const context = createWorkflowVmContext();
      const script = new Script(bundle.code);
      expect(() => script.runInContext(context)).not.toThrow();
    });

    it('creates correct __TEMPORAL__ shape', async () => {
      const bundle = await bundleWorkflowCode({
        workflowsPath: resolve(fixturesDir, 'basic-workflow/workflows.ts'),
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
        }),
      ).rejects.toThrow(WorkflowBundleError);
    });

    it('error has FORBIDDEN_MODULES code', async () => {
      try {
        await bundleWorkflowCode({
          workflowsPath: resolve(fixturesDir, 'forbidden-import/workflows.ts'),
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
        });
        expect.unreachable('Should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(WorkflowBundleError);
        const bundleError = error as WorkflowBundleError;
        expect(bundleError.context.modules).toContain('fs');
      }
    });

    it('error includes dependency chain in context', async () => {
      try {
        await bundleWorkflowCode({
          workflowsPath: resolve(fixturesDir, 'forbidden-import/workflows.ts'),
        });
        expect.unreachable('Should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(WorkflowBundleError);
        const bundleError = error as WorkflowBundleError;
        // The error should have a dependency chain showing the path to the forbidden module
        expect(bundleError.context.dependencyChain).toBeDefined();
        expect(bundleError.context.dependencyChain?.length).toBeGreaterThan(0);
      }
    });

    it('error message shows dependency chain', async () => {
      try {
        await bundleWorkflowCode({
          workflowsPath: resolve(fixturesDir, 'forbidden-import/workflows.ts'),
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
      });

      expect(bundle.code).toBeDefined();
    });

    it('ignored modules throw at runtime', async () => {
      const bundle = await bundleWorkflowCode({
        workflowsPath: resolve(fixturesDir, 'forbidden-import/workflows.ts'),
        ignoreModules: ['fs'],
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
      });

      expect(bundle.code).toBeDefined();
      expect(bundle.code).toContain('interceptors.ts');
    });
  });

  describe('node: prefix imports', () => {
    it('handles node: prefixed imports for allowed builtins', async () => {
      const bundle = await bundleWorkflowCode({
        workflowsPath: resolve(fixturesDir, 'node-prefix-imports/workflows.ts'),
      });

      expect(bundle.code).toBeDefined();
      // Should have resolved to stubs
      expect(bundle.code).toContain('module-overrides');
    });
  });

  describe('configuration validation', () => {
    it('throws for minify: true', async () => {
      // eslint-disable-next-line @typescript-eslint/await-thenable -- Bun's expect().rejects returns a Promise
      await expect(
        bundleWorkflowCode({
          workflowsPath: resolve(fixturesDir, 'basic-workflow/workflows.ts'),
          buildOptions: { minify: true },
        }),
      ).rejects.toThrow(WorkflowBundleError);
    });

    it('throws for treeShaking: true', async () => {
      // eslint-disable-next-line @typescript-eslint/await-thenable -- Bun's expect().rejects returns a Promise
      await expect(
        bundleWorkflowCode({
          workflowsPath: resolve(fixturesDir, 'basic-workflow/workflows.ts'),
          buildOptions: { treeShaking: true },
        }),
      ).rejects.toThrow(WorkflowBundleError);
    });

    it('throws for format: esm', async () => {
      // eslint-disable-next-line @typescript-eslint/await-thenable -- Bun's expect().rejects returns a Promise
      await expect(
        bundleWorkflowCode({
          workflowsPath: resolve(fixturesDir, 'basic-workflow/workflows.ts'),
          buildOptions: { format: 'esm' },
        }),
      ).rejects.toThrow(WorkflowBundleError);
    });

    it('throws for non-existent workflows path', async () => {
      // eslint-disable-next-line @typescript-eslint/await-thenable -- Bun's expect().rejects returns a Promise
      await expect(
        bundleWorkflowCode({
          workflowsPath: '/non/existent/path.ts',
        }),
      ).rejects.toThrow(WorkflowBundleError);
    });
  });

  describe('source maps', () => {
    it('includes inline source map by default', async () => {
      const bundle = await bundleWorkflowCode({
        workflowsPath: resolve(fixturesDir, 'basic-workflow/workflows.ts'),
      });

      expect(bundle.code).toContain('//# sourceMappingURL=data:');
    });

    it('excludes source map when sourceMap: none', async () => {
      const bundle = await bundleWorkflowCode({
        workflowsPath: resolve(fixturesDir, 'basic-workflow/workflows.ts'),
        sourceMap: 'none',
      });

      expect(bundle.code).not.toContain('//# sourceMappingURL=');
    });

    it('returns external source map when sourceMap: external', async () => {
      const bundle = await bundleWorkflowCode({
        workflowsPath: resolve(fixturesDir, 'basic-workflow/workflows.ts'),
        sourceMap: 'external',
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
      });

      expect(bundle.metadata?.mode).toBe('production');
    });
  });

  describe('cross-runtime support', () => {
    it('bundles with Deno-style import map', async () => {
      const bundle = await bundleWorkflowCode({
        workflowsPath: resolve(fixturesDir, 'deno-style/workflows.ts'),
        denoConfigPath: resolve(fixturesDir, 'deno-style/deno.json'),
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
      });

      expect(bundle.code).toBeDefined();
      expect(bundle.code).toContain('__TEMPORAL__');
    });
  });
});
