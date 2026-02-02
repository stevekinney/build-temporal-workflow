/**
 * Type contract tests using expectTypeOf.
 */

import { describe, expect, it } from 'bun:test';
import { expectTypeOf } from 'expect-type';

import { WorkflowBundleError } from './errors';
import type {
  BundleMetadata,
  BundleOptions,
  Logger,
  ValidationResult,
  WorkflowBundle,
  WorkflowBundleErrorCode,
} from './types';

describe('Type contracts', () => {
  describe('BundleOptions', () => {
    it('requires workflowsPath', () => {
      expectTypeOf<BundleOptions>().toHaveProperty('workflowsPath');
      expectTypeOf<BundleOptions['workflowsPath']>().toBeString();
    });

    it('has optional interceptor modules', () => {
      expectTypeOf<BundleOptions['workflowInterceptorModules']>().toEqualTypeOf<
        string[] | undefined
      >();
    });

    it('has optional payload converter path', () => {
      expectTypeOf<BundleOptions['payloadConverterPath']>().toEqualTypeOf<
        string | undefined
      >();
    });

    it('has optional failure converter path', () => {
      expectTypeOf<BundleOptions['failureConverterPath']>().toEqualTypeOf<
        string | undefined
      >();
    });

    it('has optional ignore modules', () => {
      expectTypeOf<BundleOptions['ignoreModules']>().toEqualTypeOf<
        string[] | undefined
      >();
    });

    it('has optional mode', () => {
      expectTypeOf<BundleOptions['mode']>().toEqualTypeOf<
        'development' | 'production' | undefined
      >();
    });

    it('has optional source map setting', () => {
      expectTypeOf<BundleOptions['sourceMap']>().toEqualTypeOf<
        'inline' | 'external' | 'none' | undefined
      >();
    });

    it('has optional logger', () => {
      expectTypeOf<BundleOptions['logger']>().toMatchTypeOf<Logger | undefined>();
    });
  });

  describe('WorkflowBundle', () => {
    it('has required code property', () => {
      expectTypeOf<WorkflowBundle>().toHaveProperty('code');
      expectTypeOf<WorkflowBundle['code']>().toBeString();
    });

    it('has optional sourceMap property', () => {
      expectTypeOf<WorkflowBundle['sourceMap']>().toEqualTypeOf<string | undefined>();
    });

    it('has optional metadata property', () => {
      expectTypeOf<WorkflowBundle['metadata']>().toMatchTypeOf<
        BundleMetadata | undefined
      >();
    });
  });

  describe('BundleMetadata', () => {
    it('has required createdAt', () => {
      expectTypeOf<BundleMetadata>().toHaveProperty('createdAt');
      expectTypeOf<BundleMetadata['createdAt']>().toBeString();
    });

    it('has required mode', () => {
      expectTypeOf<BundleMetadata['mode']>().toEqualTypeOf<
        'development' | 'production'
      >();
    });

    it('has required entryHash', () => {
      expectTypeOf<BundleMetadata['entryHash']>().toBeString();
    });

    it('has required bundlerVersion', () => {
      expectTypeOf<BundleMetadata['bundlerVersion']>().toBeString();
    });

    it('has required temporalSdkVersion', () => {
      expectTypeOf<BundleMetadata['temporalSdkVersion']>().toBeString();
    });

    it('has optional externals', () => {
      expectTypeOf<BundleMetadata['externals']>().toEqualTypeOf<string[] | undefined>();
    });

    it('has optional warnings', () => {
      expectTypeOf<BundleMetadata['warnings']>().toEqualTypeOf<string[] | undefined>();
    });
  });

  describe('ValidationResult', () => {
    it('has required valid property', () => {
      expectTypeOf<ValidationResult>().toHaveProperty('valid');
      expectTypeOf<ValidationResult['valid']>().toBeBoolean();
    });

    it('has optional error property', () => {
      expectTypeOf<ValidationResult['error']>().toEqualTypeOf<string | undefined>();
    });

    it('has optional warnings property', () => {
      expectTypeOf<ValidationResult['warnings']>().toEqualTypeOf<string[] | undefined>();
    });
  });

  describe('Logger', () => {
    it('has trace method', () => {
      expectTypeOf<Logger['trace']>().toBeFunction();
    });

    it('has debug method', () => {
      expectTypeOf<Logger['debug']>().toBeFunction();
    });

    it('has info method', () => {
      expectTypeOf<Logger['info']>().toBeFunction();
    });

    it('has warn method', () => {
      expectTypeOf<Logger['warn']>().toBeFunction();
    });

    it('has error method', () => {
      expectTypeOf<Logger['error']>().toBeFunction();
    });
  });

  describe('WorkflowBundleError', () => {
    it('extends Error', () => {
      const error = new WorkflowBundleError('BUILD_FAILED', {});
      expect(error).toBeInstanceOf(Error);
    });

    it('has code property', () => {
      const error = new WorkflowBundleError('FORBIDDEN_MODULES', {
        modules: ['fs'],
      });
      expect(error.code).toBe('FORBIDDEN_MODULES');
    });

    it('has context property', () => {
      const error = new WorkflowBundleError('FORBIDDEN_MODULES', {
        modules: ['fs'],
        hint: 'test hint',
      });
      expect(error.context.modules).toEqual(['fs']);
      expect(error.context.hint).toBe('test hint');
    });

    it('has proper error code type', () => {
      expectTypeOf<
        WorkflowBundleError['code']
      >().toEqualTypeOf<WorkflowBundleErrorCode>();
    });
  });
});
