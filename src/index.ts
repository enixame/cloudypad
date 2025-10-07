/**
 * Cloudypad - Cloud Gaming Infrastructure Provisioning
 * Main entry point for the package
 * 
 * For optimal tree-shaking, prefer specific imports:
 * - import { InstanceManager } from 'cloudypad/core'
 * - import { ScalewayProviderClient } from 'cloudypad/providers/scaleway'
 * - import { ValidationError } from 'cloudypad/errors'
 */

// Core exports - backward compatibility
export { InstanceManager } from './core/manager';
export { CloudypadClient } from './core/client';
export { InstanceInitializer } from './core/initializer';

// Core branded types - public API
export type { 
  UUID, 
  IPv4Address, 
  InstanceName, 
  DotNotationPath,
  Brand 
} from './core/types/branded';

export { 
  CoreBrandedTypeCreators 
} from './core/types/branded';

// Core validation - public API
export { 
  CoreValidators,
  CORE_VALIDATION_PATTERNS 
} from './core/validation/patterns';

// Re-export commonly used types for convenience
export type { ValidationError, ErrorCategory } from './core/errors/taxonomy';