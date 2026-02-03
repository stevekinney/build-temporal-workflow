/**
 * Coordinated watch mode for workflow and activity bundles.
 *
 * Watches multiple workflow and activity source files simultaneously,
 * debouncing rebuilds and coordinating callbacks.
 */

import type { WatchHandle } from './bundler';
import { watchWorkflowCode } from './bundler';
import type { WatchCoordinatorOptions, WorkflowBundle } from './types';

/**
 * Result of starting coordinated watch mode.
 */
export interface CoordinatedWatchHandle {
  /**
   * Stop all watchers.
   */
  stop(): Promise<void>;

  /**
   * Whether any watcher is running.
   */
  readonly running: boolean;
}

/**
 * Start coordinated watch mode for multiple workflow queues.
 *
 * Watches all configured workflow (and activity) paths and invokes the
 * onChange callback when any source file changes.
 *
 * @example
 * ```typescript
 * import { watchTemporalCode } from 'bundle-temporal-workflow';
 *
 * const handle = watchTemporalCode({
 *   queues: [
 *     { name: 'orders', workflowsPath: './src/workflows/orders.ts' },
 *     { name: 'users', workflowsPath: './src/workflows/users.ts' },
 *   ],
 *   debounce: 200,
 *   onChange: (queueName, type, bundle, error) => {
 *     if (error) {
 *       console.error(`${queueName} ${type} build failed:`, error);
 *     } else {
 *       console.log(`${queueName} ${type} rebuilt`);
 *     }
 *   },
 * });
 *
 * // Later: stop watching
 * await handle.stop();
 * ```
 */
export function watchTemporalCode(
  options: WatchCoordinatorOptions,
): CoordinatedWatchHandle {
  const shared = options.shared ?? {};
  const watchHandles: WatchHandle[] = [];
  let running = true;

  // Start watchers for each queue
  for (const queue of options.queues) {
    // Watch workflows
    const workflowPromise = watchWorkflowCode(
      {
        workflowsPath: queue.workflowsPath,
        tsconfigPath: shared.tsconfigPath,
        plugins: shared.plugins,
        mode: shared.mode,
        sourceMap: shared.sourceMap,
        ignoreModules: shared.ignoreModules,
        logger: shared.logger,
      },
      createDebouncedCallback(
        options.debounce ?? 100,
        (bundle: WorkflowBundle | null, error?: Error) => {
          if (!running) return;
          options.onChange(queue.name, 'workflow', bundle, error);
        },
      ),
    );

    workflowPromise
      .then((handle) => {
        watchHandles.push(handle);
      })
      .catch((err) => {
        options.onChange(
          queue.name,
          'workflow',
          null,
          err instanceof Error ? err : new Error(String(err)),
        );
      });
  }

  return {
    async stop() {
      running = false;
      await Promise.all(watchHandles.map((h) => h.stop()));
    },
    get running() {
      return running;
    },
  };
}

/**
 * Create a debounced version of a watch callback.
 */
function createDebouncedCallback(
  delayMs: number,
  callback: (bundle: WorkflowBundle | null, error?: Error) => void,
): (bundle: WorkflowBundle | null, error?: Error) => void {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let pendingBundle: WorkflowBundle | null = null;
  let pendingError: Error | undefined;

  return (bundle, error) => {
    pendingBundle = bundle;
    pendingError = error;

    if (timer) {
      clearTimeout(timer);
    }

    timer = setTimeout(() => {
      timer = null;
      callback(pendingBundle, pendingError);
    }, delayMs);
  };
}
