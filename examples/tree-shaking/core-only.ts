/**
 * Core-only import example
 * Should result in minimal bundle size
 */

import { CoreValidators } from '../../src/core/validation/patterns';

// Only use core functionality
const isValidUUID = CoreValidators.isValidUUID('12345678-1234-1234-1234-123456789abc');
console.log('Core validation result:', isValidUUID);

export { isValidUUID };