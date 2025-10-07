/**
 * Helper functions for converting strings to Scaleway branded types
 * These provide a safe way to convert validated strings to branded types
 * NOTE: This file is deprecated - use validation/schemas.ts schemas instead
 */

import type { ScalewayProjectId, ScalewayRegion, ScalewayZone, ScalewayCommercialType } from './branded'

/**
 * Safe conversion helpers for Scaleway branded types
 * These functions validate input and return branded types or throw errors
 */
export class ScalewayTypeHelpers {
    /**
     * Safely converts a string to ScalewayProjectId with validation
     * @param value - String to convert
     * @returns Branded ScalewayProjectId
     * @throws Error if validation fails
     */
    static toProjectId(value: string): ScalewayProjectId {
        if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)) {
            throw new Error(`Invalid Scaleway project ID format: ${value}`)
        }
        return value as ScalewayProjectId
    }

    /**
     * Safely converts a string to ScalewayRegion with validation
     * @param value - String to convert
     * @returns Branded ScalewayRegion
     * @throws Error if validation fails
     */
    static toRegion(value: string): ScalewayRegion {
        if (!/^[a-z]{2}-[a-z]{3}$/.test(value)) {
            throw new Error(`Invalid Scaleway region format: ${value}`)
        }
        return value as ScalewayRegion
    }

    /**
     * Safely converts a string to ScalewayZone with validation
     * @param value - String to convert
     * @returns Branded ScalewayZone
     * @throws Error if validation fails
     */
    static toZone(value: string): ScalewayZone {
        if (!/^[a-z]{2}-[a-z]{3}-\d$/.test(value)) {
            throw new Error(`Invalid Scaleway zone format: ${value}`)
        }
        return value as ScalewayZone
    }

    /**
     * Safely converts a string to ScalewayCommercialType with validation
     * @param value - String to convert
     * @returns Branded ScalewayCommercialType
     * @throws Error if validation fails
     */
    static toCommercialType(value: string): ScalewayCommercialType {
        if (!/^[A-Z0-9]+(-[A-Z0-9]+)*$/.test(value)) {
            throw new Error(`Invalid Scaleway commercial type format: ${value}`)
        }
        return value as ScalewayCommercialType
    }

    /**
     * Batch conversion utility for common Scaleway configuration
     * @param config - Configuration object with string values
     * @returns Configuration object with branded types
     * @throws Error if any validation fails
     */
    static toScalewayConfig(config: {
        projectId: string
        region: string
        zone: string
        instanceType: string
    }): {
        projectId: ScalewayProjectId
        region: ScalewayRegion
        zone: ScalewayZone
        instanceType: ScalewayCommercialType
    } {
        return {
            projectId: ScalewayTypeHelpers.toProjectId(config.projectId),
            region: ScalewayTypeHelpers.toRegion(config.region),
            zone: ScalewayTypeHelpers.toZone(config.zone),
            instanceType: ScalewayTypeHelpers.toCommercialType(config.instanceType)
        }
    }

    /**
     * Safe conversion with optional fallback - returns null if validation fails
     * Useful for cases where branded types are preferred but not required
     */
    static tryToProjectId(value: string): ScalewayProjectId | null {
        try {
            return ScalewayTypeHelpers.toProjectId(value)
        } catch {
            return null
        }
    }

    static tryToRegion(value: string): ScalewayRegion | null {
        try {
            return ScalewayTypeHelpers.toRegion(value)
        } catch {
            return null
        }
    }

    static tryToZone(value: string): ScalewayZone | null {
        try {
            return ScalewayTypeHelpers.toZone(value)
        } catch {
            return null
        }
    }

    static tryToCommercialType(value: string): ScalewayCommercialType | null {
        try {
            return ScalewayTypeHelpers.toCommercialType(value)
        } catch {
            return null
        }
    }
}