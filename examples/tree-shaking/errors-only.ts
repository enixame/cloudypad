/**
 * Errors-only import example
 * Should include core + errors, exclude everything else
 */

import { ErrorCategory, createError } from '../../src/core/errors/taxonomy';

// Only use error functionality
const errorCode = {
  code: 'TEST_ERROR',
  category: ErrorCategory.VALIDATION,
  severity: 'ERROR' as const,
  devMessage: 'Test error',
  prodMessage: 'Error occurred'
};

const error = createError(errorCode);
console.log('Error created:', error.code);

export { error };