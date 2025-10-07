/**
 * Cloudypad - Cloud Gaming Infrastructure Provisioning
 * Main entry point for the package
 */

// Core exports - backward compatibility
export { InstanceManager } from "./core/manager"
export { CloudypadClient } from "./core/client"
export { InstanceInitializer } from "./core/initializer"

// Scaleway branded types - public API
export type { 
  ScalewayProjectId, 
  ScalewayRegion, 
  ScalewayZone, 
  ScalewayCommercialType,
  ScalewayClientArgs 
} from './providers/scaleway/types/branded';

// Validation - public API (limited exports)
export type { 
  ValidationConfig, 
  ValidationMode, 
  ValidationLogger,
  SchemaVersion 
} from './providers/scaleway/validation';

export { 
  getDefaultValidationConfig,
  consoleValidationLogger,
  silentValidationLogger,
  getLatestSchemaVersion
} from './providers/scaleway/validation';

// Scaleway client
export { ScalewayClient } from './providers/scaleway/sdk-client';