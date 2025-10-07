/**
 * Scaleway Provider - Public API
 * Import this for Scaleway-specific functionality
 */

// Scaleway branded types
export type { 
  ScalewayProjectId, 
  ScalewayRegion, 
  ScalewayZone, 
  ScalewayCommercialType,
  ScalewayClientArgs 
} from './types/branded';

export { 
  ScalewayBrandedTypeCreators 
} from './types/branded';

// Scaleway validation
export type { 
  ValidationConfig, 
  ValidationMode, 
  ValidationLogger,
  SchemaVersion 
} from './validation';

export { 
  getDefaultValidationConfig,
  consoleValidationLogger,
  silentValidationLogger,
  getLatestSchemaVersion,
  validateScalewayClientArgs
} from './validation';

// Scaleway client
export { ScalewayClient } from './sdk-client';

// Scaleway provider client
export { ScalewayProviderClient } from './provider';