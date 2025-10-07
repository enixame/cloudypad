/**
 * Public Scaleway domain types - No Zod coupling
 * Only branded types and domain interfaces are exported
 */

// Re-export branded types (clean domain interface)
export type {
  ScalewayProjectId,
  ScalewayZone,
  ScalewayRegion,
  ScalewayCommercialType,
  ScalewayClientArgs
} from './types/branded'

// Template literal types for better DX (while keeping runtime validation)
export type RegionStr = `${Lowercase<string>}-${Lowercase<string>}`;           // ex: fr-par  
export type ZoneStr = `${RegionStr}-${number}`;                              // ex: fr-par-1

// Export validation configuration types (but not implementation)
export type { ValidationConfig, ValidationMode, ValidationLogger } from './validation'