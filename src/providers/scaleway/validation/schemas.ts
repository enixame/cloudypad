/**
 * Elegant Zod schemas for Scaleway branded type validation and transformation
 * Implements the 3-tier validation pattern: Raw → Strict → Lenient
 */

import { z, ZodError } from 'zod'
import type { ScalewayProjectId, ScalewayRegion, ScalewayZone, ScalewayCommercialType, ScalewayClientArgs } from '../types/branded'
import type { ValidationConfig } from './config'
import { silentValidationLogger } from './config'
import { normalizeScalewayInput, DEFAULT_NORMALIZATION } from './normalization'
import { mapValidationError, formatErrorsForCLI } from './error-mapping'
import { zoneToRegion } from './region-mapping'
import { type SchemaVersion, getLatestSchemaVersion } from './versioning'
import { migrateSchema, canMigrate } from './adapters'

// ---------------- Zod schemas ----------------

// Helpers - centralized patterns for consistency
const regionRe = /^[a-z]{2}-[a-z]{3}$/;         // fr-par
const zoneRe   = /^[a-z]{2}-[a-z]{3}-\d$/;      // fr-par-1
const commercialTypeRe = /^[A-Z0-9]+(-[A-Z0-9]+)*$/; // GPU3-S, L4-1-24G
// zoneToRegion is now imported from centralized region-mapping module

// Brand transformers (single cast spot)
const ProjectIdSchema = z.string().uuid()
  .transform(v => v as ScalewayProjectId);

const RegionSchema = z.string().regex(regionRe, "Invalid region")
  .transform(v => v as ScalewayRegion);

const ZoneSchema = z.string().regex(zoneRe, "Invalid zone")
  .transform(v => v as ScalewayZone);

const CommercialTypeSchema = z.string().regex(commercialTypeRe, "Invalid commercial type")
  .transform(v => v as ScalewayCommercialType);

// Raw → Branded (without consistency checks)
export const ScalewayClientRawArgsSchema = z.object({
  organizationId: z.string().optional(),
  projectId: z.string().uuid().optional(),
  zone: z.string().regex(zoneRe).optional(),
  region: z.string().regex(regionRe).optional(),
}).transform(({ organizationId, projectId, zone, region }) => ({
  organizationId,
  projectId: projectId ? (projectId as ScalewayProjectId) : undefined,
  zone:      zone      ? (zone as ScalewayZone)           : undefined,
  region:    region    ? (region as ScalewayRegion)       : undefined,
}));

// Strict: zone-region consistency required when both are provided
export const ScalewayClientArgsWithConsistencySchema =
  ScalewayClientRawArgsSchema
    .superRefine((val, ctx) => {
      const { zone, region } = val;
      if (zone && region) {
        const inferred = zoneToRegion(zone);
        if (inferred !== region) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: `Zone ${zone} does not belong to region ${region} (expected ${inferred}).`,
            path: ["region"],
          });
        }
      }
    });

// Lenient: infer region from zone if inconsistent/missing
export const ScalewayClientArgsLenientSchema =
  ScalewayClientRawArgsSchema
    .transform((val) => {
      const { zone, region } = val;
      if (zone) {
        const inferred = zoneToRegion(zone);
        // if region is missing or inconsistent, replace with inferred region
        if (!region || region !== inferred) {
          return { ...val, region: inferred as ScalewayRegion } as ScalewayClientArgs;
        }
      }
      return val as ScalewayClientArgs;
    });

// ---------- Production-ready validation with telemetry ----------
export interface ExtendedValidationConfig extends ValidationConfig {
  schemaVersion?: SchemaVersion;
  enableAutoMigration?: boolean;
}

export function validateScalewayClientArgs(
  rawArgs: unknown, 
  config: ExtendedValidationConfig,
  enableNormalization = true
): ScalewayClientArgs {
  const logger = config.logger || silentValidationLogger;
  
  // Handle schema versioning and migration
  const targetVersion = config.schemaVersion || getLatestSchemaVersion();
  let processedArgs = rawArgs;
  
  // Auto-migration if enabled and needed
  if (config.enableAutoMigration !== false && config.schemaVersion && config.schemaVersion !== targetVersion) {
    if (canMigrate(config.schemaVersion, targetVersion)) {
      processedArgs = migrateSchema(
        rawArgs, 
        config.schemaVersion, 
        targetVersion,
        config.enableTelemetry ? 
          (message: string) => logger.logRepair(`migration: ${message}`, rawArgs, processedArgs, 'schema_migration') :
          undefined
      );
      
      if (config.enableTelemetry) {
        logger.logRepair('schema_migration', rawArgs, processedArgs, `${config.schemaVersion}_to_${targetVersion}`);
      }
    } else if (config.schemaVersion !== 'v1') {
      // Only warn for non-v1 versions (v1 is current, no migration needed)
      logger.logRepair('unsupported_migration', { from: config.schemaVersion, to: targetVersion }, {}, 'migration_unavailable');
    }
  }
  
  // Normalize input at boundary if enabled
  if (enableNormalization && typeof processedArgs === 'object' && processedArgs !== null) {
    const normalizedArgs = normalizeScalewayInput(processedArgs as Record<string, unknown>, DEFAULT_NORMALIZATION);
    
    if (config.enableTelemetry && normalizedArgs !== processedArgs) {
      logger.logRepair('input_normalization', processedArgs, normalizedArgs, 'boundary_cleanup');
    }
    
    processedArgs = normalizedArgs;
  }
  
  if (config.mode === 'strict') {
    try {
      return ScalewayClientArgsWithConsistencySchema.parse(processedArgs);
    } catch (error) {
      if (config.enableTelemetry) {
        logger.countFallback('strict_validation_failed');
      }
      
      // Transform ZodError into user-friendly error
      if (error instanceof ZodError) {
        const friendlyErrors = mapValidationError(error);
        const formattedMessage = formatErrorsForCLI(friendlyErrors);
        throw new Error(formattedMessage);
      }
      
      throw error;
    }
  }
  
  // Lenient mode with telemetry
  const rawResult = ScalewayClientRawArgsSchema.parse(processedArgs);
  const { zone, region } = rawResult;
  
  if (zone) {
    const inferred = zoneToRegion(zone);
    if (!region) {
      // Missing region - auto-repair
      if (config.enableTelemetry) {
        logger.logRepair('infer_region_from_zone', { zone, region: undefined }, { zone, region: inferred }, 'missing_region');
      }
      return { ...rawResult, region: inferred as ScalewayRegion } as ScalewayClientArgs;
    } else if (region !== inferred) {
      // Inconsistent region - auto-repair
      if (config.enableTelemetry) {
        logger.logRepair('fix_region_zone_mismatch', { zone, region }, { zone, region: inferred }, 'inconsistent_region');
      }
      return { ...rawResult, region: inferred as ScalewayRegion } as ScalewayClientArgs;
    }
  }
  
  return rawResult as ScalewayClientArgs;
}

// ---------- Schemas for individual types (for reuse) ----------
export { ProjectIdSchema as ScalewayProjectIdSchema };
export { RegionSchema as ScalewayRegionSchema };
export { ZoneSchema as ScalewayZoneSchema };
export { CommercialTypeSchema as ScalewayCommercialTypeSchema };

// Type exports
export type ScalewayClientRawArgs = z.input<typeof ScalewayClientRawArgsSchema>
export type ScalewayClientValidatedArgs = z.output<typeof ScalewayClientRawArgsSchema>