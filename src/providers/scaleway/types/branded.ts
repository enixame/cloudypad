/**
 * Scaleway-specific branded types for enhanced type safety
 * These types provide compile-time guarantees for Scaleway-specific values
 * Using the common Brand utility from core for consistency
 */

import { Brand } from '../../../core/types/branded';

// ---------------- Domain brands ----------------
export type ScalewayProjectId = Brand<string, 'ScalewayProjectId'>;
export type ScalewayZone = Brand<string, 'ScalewayZone'>;           // ex: fr-par-1
export type ScalewayRegion = Brand<string, 'ScalewayRegion'>;       // ex: fr-par
export type ScalewayCommercialType = Brand<string, 'ScalewayCommercialType'>;

// ---------------- Type creators ----------------
export class ScalewayBrandedTypeCreators {
    /**
     * Creates a branded Scaleway project ID from a string
     * @param value - String to validate and brand
     * @returns Branded ScalewayProjectId
     * @throws Error if validation fails
     */
    static createProjectId(value: string): ScalewayProjectId {
        if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)) {
            throw new Error(`Invalid Scaleway project ID format: ${value}`)
        }
        return value as ScalewayProjectId
    }

    /**
     * Creates a branded Scaleway region
     * @param value - String to validate and brand as region
     * @returns Branded ScalewayRegion
     * @throws Error if validation fails
     */
    static createRegion(value: string): ScalewayRegion {
        if (!/^[a-z]{2}-[a-z]{3,4}$/.test(value)) {
            throw new Error(`Invalid Scaleway region format: ${value}`)
        }
        return value as ScalewayRegion
    }

    /**
     * Creates a branded Scaleway zone
     * @param value - String to validate and brand as zone
     * @returns Branded ScalewayZone
     * @throws Error if validation fails
     */
    static createZone(value: string): ScalewayZone {
        if (!/^[a-z]{2}-[a-z]{3,4}-\d$/.test(value)) {
            throw new Error(`Invalid Scaleway zone format: ${value}`)
        }
        return value as ScalewayZone
    }

    /**
     * Creates a branded Scaleway commercial type
     * @param value - String to validate and brand as commercial type
     * @returns Branded ScalewayCommercialType
     * @throws Error if validation fails
     */
    static createCommercialType(value: string): ScalewayCommercialType {
        if (!/^[A-Z0-9]+(-[A-Z0-9]+)*$/.test(value)) {
            throw new Error(`Invalid Scaleway commercial type format: ${value}`)
        }
        return value as ScalewayCommercialType
    }
}

// ---------------- Public interface ----------------
export interface ScalewayClientArgs {
    organizationId?: string;
    projectId?: ScalewayProjectId;
    zone?: ScalewayZone;
    region?: ScalewayRegion;
}