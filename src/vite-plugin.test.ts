import { resolve } from 'node:path';

import { describe, expect, it } from 'bun:test';

import { temporalWorkflow } from './vite-plugin';

const FIXTURES = resolve(import.meta.dirname, '../test/fixtures');
const BASIC_WORKFLOW = resolve(FIXTURES, 'basic-workflow/workflows.ts');

type PluginResult = ReturnType<typeof temporalWorkflow>;

function getPlugin(options = {}): PluginResult {
  return temporalWorkflow(options);
}

function callResolveId(
  plugin: PluginResult,
  source: string,
  importer?: string,
  options?: Record<string, unknown>,
) {
  return plugin.resolveId!(source, importer, options ?? {});
}

function callLoad(plugin: PluginResult, id: string) {
  return plugin.load!(id);
}

function simulateConfigResolved(
  plugin: PluginResult,
  command: 'serve' | 'build' = 'build',
) {
  plugin.configResolved!({ command });
}

describe('temporalWorkflow plugin', () => {
  describe('plugin metadata', () => {
    it('returns correct name and enforce', () => {
      const plugin = getPlugin();
      expect(plugin.name).toBe('temporal-workflow');
      expect(plugin.enforce).toBe('pre');
    });
  });

  describe('resolveId', () => {
    it('recognizes ?workflow query param', () => {
      const plugin = getPlugin();
      const result = callResolveId(plugin, './workflows?workflow', '/app/src/worker.ts');
      expect(result).toMatch(/^\0temporal-workflow:/);
      expect(result).toContain('/app/src/workflows');
    });

    it('recognizes import attributes with { type: "workflow" }', () => {
      const plugin = getPlugin();
      const result = callResolveId(plugin, './workflows', '/app/src/worker.ts', {
        attributes: { type: 'workflow' },
      });
      expect(result).toMatch(/^\0temporal-workflow:/);
    });

    it('returns null for unrelated imports', () => {
      const plugin = getPlugin();
      const result = callResolveId(plugin, './utils', '/app/src/worker.ts');
      expect(result).toBeNull();
    });

    it('supports custom identifier', () => {
      const plugin = getPlugin({ identifier: 'temporal' });
      const result = callResolveId(plugin, './workflows?temporal', '/app/src/worker.ts');
      expect(result).toMatch(/^\0temporal-workflow:/);
    });

    it('ignores wrong query param with custom identifier', () => {
      const plugin = getPlugin({ identifier: 'temporal' });
      const result = callResolveId(plugin, './workflows?workflow', '/app/src/worker.ts');
      expect(result).toBeNull();
    });
  });

  describe('load', () => {
    it('returns null for non-temporal IDs', async () => {
      const plugin = getPlugin();
      simulateConfigResolved(plugin);
      const result = await callLoad(plugin, '/some/other/module.ts');
      expect(result).toBeNull();
    });

    it('calls bundleWorkflowCode and returns export default', async () => {
      const plugin = getPlugin();
      simulateConfigResolved(plugin);
      const result = await callLoad(plugin, `\0temporal-workflow:${BASIC_WORKFLOW}`);
      expect(result).toBeTypeOf('string');
      expect(result).toContain('export default');
      expect(result).toContain('code:');
    });

    it('produces evaluable module with workflow code', async () => {
      const plugin = getPlugin();
      simulateConfigResolved(plugin);
      const result = (await callLoad(
        plugin,
        `\0temporal-workflow:${BASIC_WORKFLOW}`,
      )) as string;

      // Extract the exported object by evaluating the module
      const match = result.match(/export default (.+);$/s);
      expect(match).toBeTruthy();

      const evaluated = eval(`(${match![1]})`);
      expect(evaluated).toHaveProperty('code');
      expect(evaluated.code).toBeTypeOf('string');
      expect(evaluated.code.length).toBeGreaterThan(0);
    });

    it('forwards bundleOptions to bundleWorkflowCode', async () => {
      const plugin = getPlugin({
        bundleOptions: { sourceMap: 'none', mode: 'production' },
      });
      simulateConfigResolved(plugin);
      const result = (await callLoad(
        plugin,
        `\0temporal-workflow:${BASIC_WORKFLOW}`,
      )) as string;
      expect(result).toContain('export default');
    });

    it('propagates errors from bundleWorkflowCode', async () => {
      const plugin = getPlugin();
      simulateConfigResolved(plugin);
      const result = callLoad(plugin, '\0temporal-workflow:/nonexistent/workflows.ts');
      expect(result).rejects.toThrow();
    });
  });

  describe('caching in dev mode', () => {
    it('caches bundles in serve mode', async () => {
      const plugin = getPlugin();
      simulateConfigResolved(plugin, 'serve');

      const result1 = await callLoad(plugin, `\0temporal-workflow:${BASIC_WORKFLOW}`);
      const result2 = await callLoad(plugin, `\0temporal-workflow:${BASIC_WORKFLOW}`);
      // Both should return the same string (cached)
      expect(result1).toBe(result2);
    });
  });
});
