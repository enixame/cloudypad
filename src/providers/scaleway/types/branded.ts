/**
 * Scaleway-specific branded types for enhanced type safety
 * These types provide compile-time guarantees for Scaleway-specific values
 * Using unique symbols to prevent brand collision
 */

// ---------------- Domain brands ----------------
declare const ProjectIdBrand: unique symbol;
export type ScalewayProjectId = string & { [ProjectIdBrand]: true };

declare const ZoneBrand: unique symbol;
export type ScalewayZone = string & { [ZoneBrand]: true };       // ex: fr-par-1

declare const RegionBrand: unique symbol;
export type ScalewayRegion = string & { [RegionBrand]: true };   // ex: fr-par

declare const CommercialTypeBrand: unique symbol;
export type ScalewayCommercialType = string & { [CommercialTypeBrand]: true };

// ---------------- Public interface ----------------
export interface ScalewayClientArgs {
    organizationId?: string;
    projectId?: ScalewayProjectId;
    zone?: ScalewayZone;
    region?: ScalewayRegion;
}