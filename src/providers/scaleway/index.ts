/**
 * Scaleway Provider Module
 * Tree-shakable exports for Scaleway functionality
 */

// Core Scaleway client and interfaces
export { ScalewayProviderClient } from './provider';
export { ScalewayProvisioner } from './provisioner';
export { ScalewayInstanceRunner } from './runner';

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

// State management
export { 
  ScalewayProvisionInputV1Schema,
  ScalewayProvisionOutputV1Schema,
  type ScalewayProvisionInputV1,
  type ScalewayProvisionOutputV1
} from './state';

// Validation
export { 
  validateScalewayClientArgs,
  safeValidateScalewayClientArgs
} from './types/validation-elegant';

export { 
  getDefaultValidationConfig,
  consoleValidationLogger,
  silentValidationLogger,
  type ValidationConfig, 
  type ValidationMode, 
  type ValidationLogger
} from './validation';

// Error handling - basic error exports from core
export type { CloudyPadError, ErrorCategory } from '../../core/errors';

// Migration system
export { 
  migrateSchema,
  canMigrate,
  getAvailableMigrations,
  getLatestSchemaVersion,
  isSupportedVersion,
  getVersionInfo,
  type SchemaVersion 
} from './validation';

// Factory
export { createScalewayProvisioner, createScalewayRunner } from './factory';

// Scaleway client
export { ScalewayClient } from './sdk-client';