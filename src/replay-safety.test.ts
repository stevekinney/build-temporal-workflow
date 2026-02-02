/**
 * Tests for replay safety analysis.
 */

import { describe, expect, it } from 'bun:test';

import {
  analyzeReplaySafety,
  formatReplayViolations,
  REPLAY_UNSAFE_PATTERNS,
} from './replay-safety';

describe('replay-safety', () => {
  describe('analyzeReplaySafety', () => {
    it('detects Date.now() usage', () => {
      const code = `
        export async function myWorkflow() {
          const now = Date.now();
          return now;
        }
      `;

      const result = analyzeReplaySafety(code);

      expect(result.safe).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0]?.pattern.name).toBe('Date.now()');
    });

    it('detects new Date() usage', () => {
      const code = `
        export async function myWorkflow() {
          const now = new Date();
          return now.toISOString();
        }
      `;

      const result = analyzeReplaySafety(code);

      expect(result.safe).toBe(false);
      expect(result.errors.some((e) => e.pattern.name === 'new Date()')).toBe(true);
    });

    it('detects Math.random() usage', () => {
      const code = `
        export async function myWorkflow() {
          return Math.random();
        }
      `;

      const result = analyzeReplaySafety(code);

      expect(result.safe).toBe(false);
      expect(result.errors.some((e) => e.pattern.name === 'Math.random()')).toBe(true);
    });

    it('detects setTimeout usage', () => {
      const code = `
        export async function myWorkflow() {
          setTimeout(() => {}, 1000);
        }
      `;

      const result = analyzeReplaySafety(code);

      expect(result.safe).toBe(false);
      expect(result.errors.some((e) => e.pattern.name === 'setTimeout()')).toBe(true);
    });

    it('detects fetch() usage', () => {
      const code = `
        export async function myWorkflow() {
          const response = await fetch('https://api.example.com');
          return response.json();
        }
      `;

      const result = analyzeReplaySafety(code);

      expect(result.safe).toBe(false);
      expect(result.errors.some((e) => e.pattern.name === 'fetch()')).toBe(true);
    });

    it('detects process.env usage', () => {
      const code = `
        export async function myWorkflow() {
          return process.env.MY_VAR;
        }
      `;

      const result = analyzeReplaySafety(code);

      // process.env is a warning, not an error
      expect(result.warnings.some((w) => w.pattern.name === 'process.env')).toBe(true);
    });

    it('ignores code in comments', () => {
      const code = `
        export async function myWorkflow() {
          // Don't use Date.now() in workflows
          /* Math.random() is also bad */
          return 42;
        }
      `;

      const result = analyzeReplaySafety(code);

      expect(result.safe).toBe(true);
      expect(result.errors.length).toBe(0);
    });

    it('returns safe for clean workflow code', () => {
      const code = `
        import { sleep, uuid4 } from '@temporalio/workflow';

        export async function myWorkflow(input: string) {
          await sleep(1000);
          const id = uuid4();
          return { id, input };
        }
      `;

      const result = analyzeReplaySafety(code);

      expect(result.safe).toBe(true);
      expect(result.errors.length).toBe(0);
    });

    it('respects skipPatterns option', () => {
      const code = `
        export async function myWorkflow() {
          const now = Date.now();
          return now;
        }
      `;

      const result = analyzeReplaySafety(code, {
        skipPatterns: ['Date.now()'],
      });

      expect(result.safe).toBe(true);
    });

    it('respects errorsOnly option', () => {
      const code = `
        export async function myWorkflow() {
          return process.env.MY_VAR;
        }
      `;

      // With errorsOnly: false (default), warnings are included
      const resultWithWarnings = analyzeReplaySafety(code);
      expect(resultWithWarnings.warnings.length).toBeGreaterThan(0);

      // With errorsOnly: true, warnings become empty
      const resultErrorsOnly = analyzeReplaySafety(code, {
        errorsOnly: true,
      });
      expect(resultErrorsOnly.violations.length).toBe(0);
    });

    it('supports additional patterns', () => {
      const code = `
        export async function myWorkflow() {
          return myUnsafeFunction();
        }
      `;

      const result = analyzeReplaySafety(code, {
        additionalPatterns: [
          {
            pattern: /myUnsafeFunction\s*\(/g,
            name: 'myUnsafeFunction()',
            reason: 'Custom unsafe function',
            suggestion: 'Use a safe alternative',
            severity: 'error',
          },
        ],
      });

      expect(result.safe).toBe(false);
      expect(result.errors.some((e) => e.pattern.name === 'myUnsafeFunction()')).toBe(
        true,
      );
    });

    it('provides line and column information', () => {
      const code = `line1
line2 Date.now()
line3`;

      const result = analyzeReplaySafety(code);

      expect(result.errors.length).toBe(1);
      expect(result.errors[0]?.line).toBe(2);
      expect(result.errors[0]?.column).toBe(7);
    });

    it('detects multiple violations', () => {
      const code = `
        export async function myWorkflow() {
          const now = Date.now();
          const random = Math.random();
          await fetch('https://example.com');
          return { now, random };
        }
      `;

      const result = analyzeReplaySafety(code);

      expect(result.safe).toBe(false);
      expect(result.errors.length).toBe(3);
    });
  });

  describe('REPLAY_UNSAFE_PATTERNS', () => {
    it('has patterns for common unsafe APIs', () => {
      const patternNames = REPLAY_UNSAFE_PATTERNS.map((p) => p.name);

      expect(patternNames).toContain('Date.now()');
      expect(patternNames).toContain('new Date()');
      expect(patternNames).toContain('Math.random()');
      expect(patternNames).toContain('setTimeout()');
      expect(patternNames).toContain('fetch()');
    });

    it('each pattern has required fields', () => {
      for (const pattern of REPLAY_UNSAFE_PATTERNS) {
        expect(pattern.pattern).toBeDefined();
        expect(pattern.name).toBeDefined();
        expect(pattern.reason).toBeDefined();
        expect(pattern.suggestion).toBeDefined();
        expect(['error', 'warning']).toContain(pattern.severity);
      }
    });
  });

  describe('formatReplayViolations', () => {
    it('formats violations for display', () => {
      const code = `Date.now()`;
      const result = analyzeReplaySafety(code);

      const formatted = formatReplayViolations(result.violations);

      expect(formatted).toContain('Date.now()');
      expect(formatted).toContain('ERROR');
      expect(formatted).toContain('Line 1');
      expect(formatted).toContain('Suggestion:');
    });

    it('returns message for no violations', () => {
      const formatted = formatReplayViolations([]);
      expect(formatted).toBe('No replay-unsafe patterns found.');
    });
  });
});
