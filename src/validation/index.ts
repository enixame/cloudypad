/**
 * Cloudy Pad Validation Module
 * Tree-shakable exports for validation functionality
 */

// Core validation patterns
export { 
  CoreValidators,
  CORE_VALIDATION_PATTERNS 
} from '../core/validation/patterns';

// Scaleway validation
export { 
  validateScalewayClientArgs,
  safeValidateScalewayClientArgs 
} from '../providers/scaleway/types/validation-elegant';

export { 
  getDefaultValidationConfig,
  type ValidationConfig,
  type ValidationMode 
} from '../providers/scaleway/validation';

// Scaleway branded types
export type { 
  ScalewayProjectId, 
  ScalewayRegion, 
  ScalewayZone 
} from '../providers/scaleway/types/branded';

// Migration system
export { 
  migrateSchema,
  canMigrate,
  getAvailableMigrations,
  adapterRegistry,
  type SchemaAdapter,
  type MigrationContext 
} from '../providers/scaleway/validation/adapters';

export { 
  getLatestSchemaVersion,
  isSupportedVersion,
  getVersionInfo,
  type SchemaVersion 
} from '../providers/scaleway/validation/versioning';