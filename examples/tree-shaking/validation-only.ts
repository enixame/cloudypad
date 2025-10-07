/**
 * Validation-only import example
 * Should include core + validation, exclude providers
 */

import { getDefaultValidationConfig } from '../../src/providers/scaleway/validation';

// Only use validation functionality
const config = getDefaultValidationConfig();
console.log('Default validation mode:', config.mode);

export { config };