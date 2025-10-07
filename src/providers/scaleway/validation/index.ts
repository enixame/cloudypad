/**
 * Internal validation module - Zod implementation details hidden from domain
 * Only exposes the validateScalewayClientArgs function and configuration types
 */

export { validateScalewayClientArgs } from './schemas'
export type { ValidationConfig, ValidationMode, ValidationLogger } from './config'
export { getDefaultValidationConfig, consoleValidationLogger, silentValidationLogger } from './config'
export { normalizeScalewayInput, DEFAULT_NORMALIZATION, type NormalizationOptions } from './normalization'
export { mapValidationError, formatErrorsForCLI, type FriendlyError } from './error-mapping'
export { 
  type SchemaVersion, 
  type VersionedValidationConfig,
  getLatestSchemaVersion, 
  isSupportedVersion,
  getVersionInfo,
  SCHEMA_EVOLUTION_HISTORY 
} from './versioning'
export { 
  migrateSchema, 
  canMigrate, 
  getAvailableMigrations,
  type SchemaAdapter,
  type MigrationContext 
} from './adapters'
export {
  zoneToRegion,
  getZonesForRegion,
  getAllSupportedRegions,
  getAllSupportedZones,
  validateZoneRegionConsistency,
  getMappingInfo,
  type RegionMapping
} from './region-mapping'

// Domain types are imported from the public interface
export type { ScalewayClientArgs } from '../types/branded'

// Internal type for raw inputs (used only at boundaries)
export type ScalewayClientRawArgs = {
  organizationId?: string;
  projectId?: string;
  zone?: string;
  region?: string;
};