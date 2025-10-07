/**
 * Cloudy Pad Core Module
 * Tree-shakable exports for core functionality
 */

// Core managers and clients
export { InstanceManager } from './manager';
export { CloudypadClient } from './client';
export { InstanceInitializer } from './initializer';

// Core interfaces
export type { AbstractProviderClient } from './provider';
export type { AbstractInstanceProvisioner } from './provisioner';
export type { AbstractInstanceRunner } from './runner';

// Core configuration
export { CoreConfig } from './config';

// Branded types
export type { 
  UUID, 
  IPv4Address, 
  InstanceName, 
  DotNotationPath,
  Brand 
} from './types/branded';

export { 
  CoreBrandedTypeCreators 
} from './types/branded';

// Validation patterns
export { 
  CoreValidators,
  CORE_VALIDATION_PATTERNS 
} from './validation/patterns';

// Type guards
export { 
  CommonTypeGuards,
  TypeGuardBuilder 
} from './type-guards';

// State management
export { 
  GenericStateParser,
  type StateParser 
} from './state';

// Constants
export { 
  SUPPORTED_PROVIDERS
} from './const';

export {
  DEFAULT_CORE_CONFIG
} from './config';