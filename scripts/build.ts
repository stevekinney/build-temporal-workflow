import { $ } from 'bun';

await $`rm -rf dist`;

// Build library
await Bun.build({
  entrypoints: ['./src/index.ts'],
  outdir: './dist',
  target: 'node',
  format: 'esm',
  naming: '[dir]/[name].js',
  sourcemap: 'external',
  minify: true,
  // Mark peer dependencies and their transitive deps as external
  external: ['@temporalio/*', 'esbuild'],
});

// Build CLI (includes shebang for executable)
await Bun.build({
  entrypoints: ['./src/cli.ts'],
  outdir: './dist',
  target: 'node',
  format: 'esm',
  naming: '[dir]/[name].js',
  sourcemap: 'external',
  minify: false, // Keep CLI readable for debugging
  external: ['@temporalio/*', 'esbuild'],
});

// Build Vite plugin
await Bun.build({
  entrypoints: ['./src/vite-plugin.ts'],
  outdir: './dist',
  target: 'node',
  format: 'esm',
  naming: '[dir]/[name].js',
  sourcemap: 'external',
  minify: true,
  external: ['@temporalio/*', 'esbuild', 'vite'],
});

await $`bunx tsc --declaration --emitDeclarationOnly --project tsconfig.build.json`;

console.log('Build complete!');
