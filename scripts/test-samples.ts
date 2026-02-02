/**
 * Test bundleWorkflowCode against temporalio/samples-typescript.
 *
 * Uses degit to clone the samples repo, discovers workflow files,
 * installs dependencies, and attempts to bundle each sample.
 */

import { existsSync } from 'node:fs';
import { readdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';

import { bundleWorkflowCode } from '../src/bundler';

const SAMPLES_DIR = resolve(import.meta.dirname, '..', '.tmp', 'samples-typescript');

interface SampleResult {
  name: string;
  status: 'pass' | 'fail' | 'skip';
  error?: string;
}

async function cloneSamples(): Promise<void> {
  if (existsSync(SAMPLES_DIR)) {
    console.log('Samples already cloned, skipping degit.');
    return;
  }

  console.log('Cloning temporalio/samples-typescript...');
  const degitModule = await import('degit');
  const degit = degitModule.default;
  const emitter = degit('temporalio/samples-typescript', { cache: false, force: true });
  await emitter.clone(SAMPLES_DIR);
  console.log('Clone complete.');
}

async function discoverSamples(): Promise<{ name: string; workflowsPath: string }[]> {
  const entries = await readdir(SAMPLES_DIR, { withFileTypes: true });
  const samples: { name: string; workflowsPath: string }[] = [];

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;

    const candidates = [
      join(SAMPLES_DIR, entry.name, 'src', 'workflows.ts'),
      join(SAMPLES_DIR, entry.name, 'src', 'workflows', 'index.ts'),
    ];

    for (const candidate of candidates) {
      if (existsSync(candidate)) {
        samples.push({ name: entry.name, workflowsPath: candidate });
        break;
      }
    }
  }

  return samples;
}

async function installDeps(sampleDir: string): Promise<boolean> {
  const packageJson = join(sampleDir, 'package.json');
  if (!existsSync(packageJson)) return false;

  const nodeModules = join(sampleDir, 'node_modules');
  if (existsSync(nodeModules)) return true;

  const proc = Bun.spawn(['npm', 'install', '--ignore-scripts'], {
    cwd: sampleDir,
    stdout: 'ignore',
    stderr: 'pipe',
  });

  const exitCode = await proc.exited;
  if (exitCode !== 0) {
    const stderr = await new Response(proc.stderr).text();
    console.warn(`  npm install failed for ${sampleDir}: ${stderr.slice(0, 200)}`);
    return false;
  }
  return true;
}

async function bundleSample(sample: {
  name: string;
  workflowsPath: string;
}): Promise<SampleResult> {
  const sampleDir = join(SAMPLES_DIR, sample.name);

  const installed = await installDeps(sampleDir);
  if (!installed) {
    return {
      name: sample.name,
      status: 'skip',
      error: 'npm install failed or no package.json',
    };
  }

  try {
    const bundle = await bundleWorkflowCode({
      workflowsPath: sample.workflowsPath,
    });

    if (!bundle.code.includes('__TEMPORAL__')) {
      return {
        name: sample.name,
        status: 'fail',
        error: 'Bundle output missing __TEMPORAL__ marker',
      };
    }

    return { name: sample.name, status: 'pass' };
  } catch (error) {
    return {
      name: sample.name,
      status: 'fail',
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

export async function runAllSamples(): Promise<SampleResult[]> {
  await cloneSamples();

  const samples = await discoverSamples();
  console.log(`Discovered ${samples.length} samples with workflow files.\n`);

  const results: SampleResult[] = [];

  for (const sample of samples) {
    process.stdout.write(`  ${sample.name} ... `);
    const result = await bundleSample(sample);
    const detail = result.error ? ` (${result.error.slice(0, 80)})` : '';
    console.log(result.status + detail);
    results.push(result);
  }

  return results;
}

function printSummary(results: SampleResult[]): void {
  const pass = results.filter((r) => r.status === 'pass').length;
  const fail = results.filter((r) => r.status === 'fail').length;
  const skip = results.filter((r) => r.status === 'skip').length;

  console.log('\n--- Summary ---');
  console.log(`  Pass: ${pass}`);
  console.log(`  Fail: ${fail}`);
  console.log(`  Skip: ${skip}`);
  console.log(`  Total: ${results.length}`);

  if (fail > 0) {
    console.log('\nUnexpected failures:');
    for (const r of results.filter((r) => r.status === 'fail')) {
      console.log(`  - ${r.name}: ${r.error}`);
    }
  }
}

// Run standalone
if (import.meta.main) {
  const results = await runAllSamples();
  printSummary(results);
  const failures = results.filter((r) => r.status === 'fail');
  process.exit(failures.length > 0 ? 1 : 0);
}
