/**
 * Vite plugin for bundling Temporal workflow code.
 *
 * @example
 * ```ts
 * // vite.config.ts
 * import { temporalWorkflow } from 'build-temporal-workflow/vite';
 * export default { plugins: [temporalWorkflow()] };
 *
 * // app code
 * import bundle from './workflows?workflow';
 * const worker = await Worker.create({ workflowBundle: bundle, taskQueue: 'q' });
 * ```
 *
 * @module
 */

import { resolve } from 'node:path';

import { bundleWorkflowCode } from './bundler';
import type { BundleOptions, WorkflowBundle } from './types';

const PLUGIN_NAME = 'temporal-workflow';
const PREFIX = '\0temporal-workflow:';

/** Minimal Vite plugin interface to avoid requiring vite as a dependency at build time. */
interface VitePlugin {
  name: string;
  enforce?: 'pre' | 'post';
  configResolved?(config: { command: 'serve' | 'build' }): void;
  resolveId?(
    source: string,
    importer: string | undefined,
    options: Record<string, unknown>,
  ): string | null;
  load?(id: string): Promise<string | null> | string | null;
  handleHotUpdate?(ctx: {
    file: string;
    server: {
      moduleGraph: {
        getModuleById(id: string): { id: string } | undefined;
        invalidateModule(mod: { id: string }): void;
      };
      ws: { send(payload: { type: string }): void };
    };
  }): void | unknown[];
}

export interface TemporalWorkflowPluginOptions {
  /** Query param / import attribute identifier. Default: 'workflow' */
  identifier?: string;
  /** Forwarded to bundleWorkflowCode (minus workflowsPath) */
  bundleOptions?: Omit<BundleOptions, 'workflowsPath'>;
}

export function temporalWorkflow(
  options: TemporalWorkflowPluginOptions = {},
): VitePlugin {
  const identifier = options.identifier ?? 'workflow';
  let config: { command: 'serve' | 'build' };
  const cache = new Map<string, WorkflowBundle>();

  return {
    name: PLUGIN_NAME,
    enforce: 'pre',

    configResolved(resolvedConfig: { command: 'serve' | 'build' }) {
      config = resolvedConfig;
    },

    resolveId(
      source: string,
      importer: string | undefined,
      resolveOptions: Record<string, unknown>,
    ) {
      // Check import attributes
      const attributes = resolveOptions?.['attributes'] as
        | Record<string, string>
        | undefined;
      if (attributes?.['type'] === identifier) {
        const resolved = resolve(
          importer ? importer.replace(/[/\\][^/\\]*$/, '') : '',
          source,
        );
        return PREFIX + resolved;
      }

      // Check query param
      const queryMarker = `?${identifier}`;
      if (source.includes(queryMarker)) {
        const cleanPath = source.split('?')[0]!;
        const resolved = resolve(
          importer ? importer.replace(/[/\\][^/\\]*$/, '') : '',
          cleanPath,
        );
        return PREFIX + resolved;
      }

      return null;
    },

    async load(id: string) {
      if (!id.startsWith(PREFIX)) return null;

      const workflowsPath = id.slice(PREFIX.length);

      // Check cache in dev mode
      if (config?.command === 'serve' && cache.has(workflowsPath)) {
        const bundle = cache.get(workflowsPath)!;
        return buildModule(bundle);
      }

      const bundle = await bundleWorkflowCode({
        workflowsPath,
        ...options.bundleOptions,
      });

      if (config?.command === 'serve') {
        cache.set(workflowsPath, bundle);
      }

      return buildModule(bundle);
    },

    handleHotUpdate({ file, server }) {
      if (!file.match(/\.[tj]sx?$/)) return;

      // Check if file is under any cached workflow directory
      for (const [workflowsPath] of cache) {
        const workflowDir = workflowsPath.replace(/[/\\][^/\\]*$/, '');
        if (file.startsWith(workflowDir)) {
          cache.delete(workflowsPath);
          const mod = server.moduleGraph.getModuleById(PREFIX + workflowsPath);
          if (mod) {
            server.moduleGraph.invalidateModule(mod);
          }
          server.ws.send({ type: 'full-reload' });
          return [];
        }
      }
      return undefined;
    },
  };
}

function buildModule(bundle: WorkflowBundle): string {
  return `export default { code: ${JSON.stringify(bundle.code)}, sourceMap: ${JSON.stringify(bundle.sourceMap ?? '')} };`;
}
