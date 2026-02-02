/**
 * Tests for the CLI.
 *
 * These tests run the CLI as a subprocess to verify end-to-end behavior.
 */

import { resolve } from 'node:path';

import { describe, expect, it } from 'bun:test';

const cliPath = resolve(__dirname, 'cli.ts');
const fixturesDir = resolve(__dirname, '../test/fixtures');

/**
 * Run the CLI with the given arguments.
 */
async function runCli(
  args: string[],
): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  const proc = Bun.spawn(['bun', cliPath, ...args], {
    stdout: 'pipe',
    stderr: 'pipe',
  });

  const stdout = await new Response(proc.stdout).text();
  const stderr = await new Response(proc.stderr).text();
  const exitCode = await proc.exited;

  return { stdout, stderr, exitCode };
}

describe('CLI', () => {
  describe('help command', () => {
    it('shows help with --help flag', async () => {
      const result = await runCli(['--help']);

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('bundle-temporal-workflow');
      expect(result.stdout).toContain('COMMANDS');
      expect(result.stdout).toContain('build');
      expect(result.stdout).toContain('analyze');
      expect(result.stdout).toContain('doctor');
    });

    it('shows help with help command', async () => {
      const result = await runCli(['help']);

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('bundle-temporal-workflow');
    });

    it('shows help when no command provided', async () => {
      const result = await runCli([]);

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('USAGE');
    });
  });

  describe('version command', () => {
    it('shows version with --version flag', async () => {
      const result = await runCli(['--version']);

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toMatch(/bundle-temporal-workflow v\d+\.\d+\.\d+/);
    });

    it('shows version with version command', async () => {
      const result = await runCli(['version']);

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toMatch(/bundle-temporal-workflow v\d+\.\d+\.\d+/);
    });
  });

  describe('doctor command', () => {
    it('runs doctor checks', async () => {
      const result = await runCli(['doctor']);

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('Environment Check');
      expect(result.stdout).toContain('Bundler Version');
      expect(result.stdout).toContain('Temporal SDK');
      expect(result.stdout).toContain('esbuild');
    });

    it('outputs JSON with --json flag', async () => {
      const result = await runCli(['doctor', '--json']);

      expect(result.exitCode).toBe(0);

      const json = JSON.parse(result.stdout);
      expect(json).toHaveProperty('checks');
      expect(json).toHaveProperty('summary');
      expect(Array.isArray(json.checks)).toBe(true);
    });
  });

  describe('build command', () => {
    it('fails without workflows path', async () => {
      const result = await runCli(['build']);

      expect(result.exitCode).toBe(1);
      // Error is written to stderr, usage hint to stdout
      expect(result.stderr).toContain('Missing required argument');
    });

    it('fails with non-existent path', async () => {
      const result = await runCli(['build', '/non/existent/path.ts']);

      expect(result.exitCode).toBe(1);
      expect(result.stderr).toContain('does not exist');
    });

    it('builds basic workflow', async () => {
      const workflowsPath = resolve(fixturesDir, 'basic-workflow/workflows.ts');
      const result = await runCli(['build', workflowsPath, '--json']);

      expect(result.exitCode).toBe(0);

      const json = JSON.parse(result.stdout);
      expect(json.success).toBe(true);
      expect(json.size).toBeGreaterThan(0);
      expect(json.buildTime).toBeGreaterThan(0);
    });

    it('fails with forbidden modules', async () => {
      const workflowsPath = resolve(fixturesDir, 'forbidden-import/workflows.ts');
      const result = await runCli(['build', workflowsPath, '--json']);

      expect(result.exitCode).toBe(1);

      const json = JSON.parse(result.stdout);
      expect(json.success).toBe(false);
      expect(json.error).toBeDefined();
      expect(json.error.message).toContain('disallowed modules');
    });

    it('succeeds with ignored modules', async () => {
      const workflowsPath = resolve(fixturesDir, 'forbidden-import/workflows.ts');
      const result = await runCli(['build', workflowsPath, '-i', 'fs', '--json']);

      expect(result.exitCode).toBe(0);

      const json = JSON.parse(result.stdout);
      expect(json.success).toBe(true);
    });
  });

  describe('analyze command', () => {
    it('fails without workflows path', async () => {
      const result = await runCli(['analyze']);

      expect(result.exitCode).toBe(1);
      // Error is written to stderr, usage hint to stdout
      expect(result.stderr).toContain('Missing required argument');
    });

    it('analyzes basic workflow', async () => {
      const workflowsPath = resolve(fixturesDir, 'basic-workflow/workflows.ts');
      const result = await runCli(['analyze', workflowsPath]);

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('Bundle Analysis');
      expect(result.stdout).toContain('Summary');
      expect(result.stdout).toContain('Module count');
      expect(result.stdout).toContain('Largest Modules');
    });

    it('outputs JSON with --json flag', async () => {
      const workflowsPath = resolve(fixturesDir, 'basic-workflow/workflows.ts');
      const result = await runCli(['analyze', workflowsPath, '--json']);

      expect(result.exitCode).toBe(0);

      const json = JSON.parse(result.stdout);
      expect(json).toHaveProperty('totalSize');
      expect(json).toHaveProperty('moduleCount');
      expect(json).toHaveProperty('modules');
      expect(json).toHaveProperty('topLevelDependencies');
      expect(Array.isArray(json.modules)).toBe(true);
    });

    it('shows forbidden modules in analysis', async () => {
      const workflowsPath = resolve(fixturesDir, 'forbidden-import/workflows.ts');
      const result = await runCli(['analyze', workflowsPath]);

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('Forbidden Modules Found');
      expect(result.stdout).toContain('fs');
    });

    it('shows dependency chain for forbidden modules', async () => {
      const workflowsPath = resolve(fixturesDir, 'forbidden-import/workflows.ts');
      const result = await runCli(['analyze', workflowsPath, '--json']);

      expect(result.exitCode).toBe(0);

      const json = JSON.parse(result.stdout);
      expect(json.forbiddenModulesFound.length).toBeGreaterThan(0);
      expect(json.forbiddenModulesFound[0].module).toBe('fs');
      expect(json.forbiddenModulesFound[0].chain.length).toBeGreaterThan(0);
    });
  });
});
