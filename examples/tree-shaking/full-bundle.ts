/**
 * Full bundle import example
 * Imports everything - should be largest bundle
 */

import { InstanceManager } from '../../src/core/manager';
import { validateScalewayClientArgs } from '../../src/providers/scaleway/types/validation-elegant';
import { createError, ErrorCategory } from '../../src/core/errors/taxonomy';

// Use multiple functionalities
console.log('Full bundle loaded');
console.log('InstanceManager available:', !!InstanceManager);
console.log('Scaleway validation available:', !!validateScalewayClientArgs);
console.log('Error system available:', !!createError);
console.log('ErrorCategory enum:', ErrorCategory.VALIDATION);

export { InstanceManager, validateScalewayClientArgs, createError };