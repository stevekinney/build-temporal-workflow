import { $ } from 'bun';

const entrypoints = ['./src/index.ts'];

await $`rm -rf dist`;

await Bun.build({
  entrypoints,
  outdir: './dist',
  target: 'node',
  format: 'esm',
  naming: '[dir]/[name].js',
  sourcemap: 'external',
  minify: true,
  // Mark peer dependencies and their transitive deps as external
  external: ['@temporalio/*', 'esbuild'],
});

await $`bunx tsc --declaration --emitDeclarationOnly --project tsconfig.build.json`;

console.log('Build complete!');
