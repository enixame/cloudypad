/**
 * Scaleway-specific validation patterns and utilities
 * Extends core validation patterns with Scaleway naming conventions
 */

/**
 * Scaleway-specific validation patterns
 * These patterns enforce Scaleway's specific naming requirements
 */
export const SCALEWAY_VALIDATION_PATTERNS = {
    /** Scaleway snapshot name validation (alphanumeric, dash, underscore, max 63 chars) */
    SNAPSHOT_NAME: /^[a-zA-Z0-9-_]{1,63}$/,
    
    /** Scaleway commercial type pattern (e.g., GPU3-S, RENDER-S, L4-1-24G) */
    COMMERCIAL_TYPE: /^[A-Z0-9]+(-[A-Z0-9]+)*$/,
    
    /** Scaleway region pattern (e.g., fr-par, nl-ams) */
    REGION: /^[a-z]{2}-[a-z]{3,4}$/,
    
    /** Scaleway zone pattern (e.g., fr-par-1, nl-ams-1) */
    ZONE: /^[a-z]{2}-[a-z]{3}-\d$/,
} as const

/**
 * Scaleway-specific validation utilities
 * Implements Scaleway's validation requirements
 */
export class ScalewayValidators {
    /**
     * Validates Scaleway snapshot name format
     * @param name - The snapshot name to validate
     * @returns true if valid Scaleway snapshot name
     */
    static isValidSnapshotName(name: string): boolean {
        return typeof name === 'string' && SCALEWAY_VALIDATION_PATTERNS.SNAPSHOT_NAME.test(name)
    }

    /**
     * Validates Scaleway commercial type format
     * @param type - The commercial type to validate
     * @returns true if valid Scaleway commercial type
     */
    static isValidCommercialType(type: string): boolean {
        return typeof type === 'string' && SCALEWAY_VALIDATION_PATTERNS.COMMERCIAL_TYPE.test(type)
    }

    /**
     * Validates Scaleway region format
     * @param region - The region to validate
     * @returns true if valid Scaleway region
     */
    static isValidRegion(region: string): boolean {
        return typeof region === 'string' && SCALEWAY_VALIDATION_PATTERNS.REGION.test(region)
    }

    /**
     * Validates Scaleway zone format
     * @param zone - The zone to validate
     * @returns true if valid Scaleway zone
     */
    static isValidZone(zone: string): boolean {
        return typeof zone === 'string' && SCALEWAY_VALIDATION_PATTERNS.ZONE.test(zone)
    }
}