/**
 * Cloudypad - Cloud Gaming Infrastructure Provisioning
 * Main entry point for the package
 */

// Core exports - backward compatibility
export { InstanceManager } from "./core/manager"
export { CloudypadClient } from "./core/client"
export { InstanceInitializer } from "./core/initializer"

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

// Provider-specific exports should be imported directly from providers
// Example: import { ScalewayClient } from 'cloudypad/providers/scaleway'