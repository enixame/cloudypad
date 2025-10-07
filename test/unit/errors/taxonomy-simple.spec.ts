/**
 * Error taxonomy system tests - simplified version
 * Validates core error handling without external dependencies
 */

import { describe, it } from 'mocha';
import { expect } from 'chai';

// Import directly from the source
import {
  ErrorCategory,
  ErrorSeverity,
  ErrorEnvironment,
  ErrorCodeRegistry,
  CloudyPadError,
  ValidationError,
  createError,
  isCloudyPadError,
  type ErrorCode
} from '../../../src/core/errors/taxonomy';

describe('🚨 Error Taxonomy System - Simplified', () => {

  describe('Core Error Infrastructure', () => {
    
    it('should create and register error codes correctly', () => {
      const testErrorCode: ErrorCode = {
        code: 'TEST_ERROR_001',
        category: ErrorCategory.VALIDATION,
        severity: ErrorSeverity.ERROR,
        devMessage: 'Test error for development',
        prodMessage: 'Test error occurred',
        suggestions: ['Try again', 'Check configuration']
      };

      ErrorCodeRegistry.register(testErrorCode);
      
      const retrieved = ErrorCodeRegistry.get('TEST_ERROR_001');
      expect(retrieved).to.deep.equal(testErrorCode);
    });

    it('should filter error codes by category and severity', () => {
      const validationError: ErrorCode = {
        code: 'VAL_001',
        category: ErrorCategory.VALIDATION,
        severity: ErrorSeverity.ERROR,
        devMessage: 'Validation error',
        prodMessage: 'Validation failed'
      };

      const criticalError: ErrorCode = {
        code: 'CRIT_001',
        category: ErrorCategory.SYSTEM,
        severity: ErrorSeverity.CRITICAL,
        devMessage: 'Critical system error',
        prodMessage: 'System error'
      };

      ErrorCodeRegistry.register(validationError);
      ErrorCodeRegistry.register(criticalError);

      const validationErrors = ErrorCodeRegistry.getByCategory(ErrorCategory.VALIDATION);
      expect(validationErrors).to.have.length.greaterThan(0);
      expect(validationErrors.some(e => e.code === 'VAL_001')).to.equal(true);

      const criticalErrors = ErrorCodeRegistry.getBySeverity(ErrorSeverity.CRITICAL);
      expect(criticalErrors).to.have.length.greaterThan(0);
      expect(criticalErrors.some(e => e.code === 'CRIT_001')).to.equal(true);
    });

  });

  describe('Error Class Hierarchy', () => {

    it('should create ValidationError with proper inheritance', () => {
      const errorCode: ErrorCode = {
        code: 'TEST_VALIDATION_ERROR',
        category: ErrorCategory.VALIDATION,
        severity: ErrorSeverity.ERROR,
        devMessage: 'Test validation error for development',
        prodMessage: 'Validation failed'
      };
      
      const context = { field: 'region', value: 'invalid' };
      
      const error = new ValidationError(errorCode, context);
      
      expect(error).to.be.instanceOf(CloudyPadError);
      expect(error).to.be.instanceOf(ValidationError);
      expect(error.code).to.equal('TEST_VALIDATION_ERROR');
      expect(error.category).to.equal(ErrorCategory.VALIDATION);
      expect(error.severity).to.equal(ErrorSeverity.ERROR);
      expect(error.context).to.deep.equal(context);
    });

    it('should handle dev vs prod messaging correctly', () => {
      const errorCode: ErrorCode = {
        code: 'TEST_ENV_ERROR',
        category: ErrorCategory.VALIDATION,
        severity: ErrorSeverity.ERROR,
        devMessage: 'Detailed technical error message for developers',
        prodMessage: 'User-friendly error message'
      };
      
      const devError = new ValidationError(errorCode, {}, undefined, ErrorEnvironment.DEVELOPMENT);
      const prodError = new ValidationError(errorCode, {}, undefined, ErrorEnvironment.PRODUCTION);
      
      expect(devError.message).to.include('technical error');
      expect(prodError.message).to.equal('User-friendly error message'); 
      expect(devError.message).to.not.equal(prodError.message);
    });

    it('should preserve original error and stack trace', () => {
      const originalError = new Error('Original network failure');
      const errorCode: ErrorCode = {
        code: 'TEST_WRAPPED_ERROR',
        category: ErrorCategory.PROVIDER,
        severity: ErrorSeverity.ERROR,
        devMessage: 'Provider error occurred',
        prodMessage: 'Service unavailable'
      };
      
      const wrappedError = new ValidationError(errorCode, {}, originalError);
      
      expect(wrappedError.originalError).to.equal(originalError);
      expect(wrappedError.stack).to.be.a('string');
      expect(wrappedError.stack).to.include('ValidationError');
    });

  });

  describe('Error Creation Utilities', () => {

    it('should create appropriate error types based on category', () => {
      const validationCode: ErrorCode = {
        code: 'CREATE_VALIDATION_TEST',
        category: ErrorCategory.VALIDATION,
        severity: ErrorSeverity.ERROR,
        devMessage: 'Validation error test',
        prodMessage: 'Validation failed'
      };
      
      const migrationCode: ErrorCode = {
        code: 'CREATE_MIGRATION_TEST',
        category: ErrorCategory.MIGRATION,
        severity: ErrorSeverity.ERROR,
        devMessage: 'Migration error test',
        prodMessage: 'Migration failed'
      };

      const validationError = createError(validationCode);
      const migrationError = createError(migrationCode);

      expect(validationError).to.be.instanceOf(ValidationError);
      expect(migrationError.category).to.equal(ErrorCategory.MIGRATION);
    });

    it('should handle error type guards correctly', () => {
      const errorCode: ErrorCode = {
        code: 'TYPE_GUARD_TEST',
        category: ErrorCategory.VALIDATION,
        severity: ErrorSeverity.ERROR,
        devMessage: 'Type guard test error',
        prodMessage: 'Test error'
      };
      
      const cloudyPadError = createError(errorCode);
      const regularError = new Error('Regular error');
      const notAnError = 'just a string';

      expect(isCloudyPadError(cloudyPadError)).to.equal(true);
      expect(isCloudyPadError(regularError)).to.equal(false);
      expect(isCloudyPadError(notAnError)).to.equal(false);
    });

  });

  describe('Error Serialization', () => {

    it('should serialize errors for logging/telemetry', () => {
      const errorCode: ErrorCode = {
        code: 'SERIALIZATION_TEST',
        category: ErrorCategory.PROVIDER,
        severity: ErrorSeverity.ERROR,
        devMessage: 'Serialization test error',
        prodMessage: 'Service error'
      };
      
      const context = { region: 'fr-par', operation: 'create' };
      const originalError = new Error('API failure');
      
      const error = createError(errorCode, context, originalError);
      const serialized = error.toJSON();
      
      expect(serialized).to.have.property('name');
      expect(serialized).to.have.property('code');
      expect(serialized).to.have.property('category');
      expect(serialized).to.have.property('severity');
      expect(serialized).to.have.property('message');
      expect(serialized).to.have.property('timestamp');
      expect(serialized).to.have.property('context');
      expect(serialized).to.have.property('stack');
      expect(serialized).to.have.property('originalError');
      
      expect(serialized.context).to.deep.equal(context);
      expect(serialized.originalError).to.equal('API failure');
    });

  });

  describe('Production Environment Behavior', () => {

    it('should hide sensitive context in production', () => {
      const errorCode: ErrorCode = {
        code: 'SENSITIVE_DATA_TEST',
        category: ErrorCategory.AUTHENTICATION,
        severity: ErrorSeverity.CRITICAL,
        devMessage: 'Authentication failed with detailed info',
        prodMessage: 'Authentication failed'
      };
      
      const sensitiveContext = {
        apiKey: 'secret-key-12345',
        password: 'super-secret',
        userId: '12345'
      };

      const error = createError(
        errorCode,
        sensitiveContext,
        undefined,
        ErrorEnvironment.PRODUCTION
      );

      const prodDetails = error.getDetails(ErrorEnvironment.PRODUCTION);
      const devDetails = error.getDetails(ErrorEnvironment.DEVELOPMENT);

      // Production should hide context
      expect(prodDetails.context).to.deep.equal({});
      
      // Development should show context
      expect(devDetails.context).to.deep.equal(sensitiveContext);
    });

    it('should use production-friendly error messages', () => {
      const errorCode: ErrorCode = {
        code: 'PROD_MESSAGE_TEST',
        category: ErrorCategory.VALIDATION,
        severity: ErrorSeverity.ERROR,
        devMessage: 'Field validation failed: expected UUID v4 format with specific pattern xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx',
        prodMessage: 'Invalid identifier format'
      };
      
      const error = createError(
        errorCode,
        {},
        undefined,
        ErrorEnvironment.PRODUCTION
      );

      expect(error.message).to.equal('Invalid identifier format');
      expect(error.message).to.not.include('UUID v4');
      expect(error.message).to.not.include('xxxxxxxx-xxxx');
    });

  });

});