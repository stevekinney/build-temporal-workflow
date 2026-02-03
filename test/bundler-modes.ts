import { describe } from 'bun:test';

export const BUNDLER_MODES = ['esbuild', 'bun'] as const;
export type BundlerMode = (typeof BUNDLER_MODES)[number];

export function describeBundlerModes(
  name: string,
  fn: (bundler: BundlerMode) => void,
): void {
  for (const bundler of BUNDLER_MODES) {
    describe(`${name} [${bundler}]`, () => fn(bundler));
  }
}
