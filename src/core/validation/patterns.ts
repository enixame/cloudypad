/**
 * Core validation patterns used across all cloud providers
 * These patterns are compiled once and reused throughout the application
 */

/**
 * Universal validation patterns for multi-provider support
 * These regex patterns are provider-agnostic and can be used by any cloud provider
 */
export const CORE_VALIDATION_PATTERNS = {
    /** UUID v4 pattern (RFC 4122) - used by all cloud providers */
    UUID: /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    
    /** IPv4 address validation pattern */
    IP_V4: /^((25[0-5]|(2[0-4]|1\d|[1-9]|)\d)\.?\b){4}$/,
    
    /** Dot-notation path validation (e.g., 'provision.input.region') */
    PATH: /^[a-zA-Z][a-zA-Z0-9.]*[a-zA-Z0-9]$/,
    
    /** Generic instance name pattern (alphanumeric with dashes) */
    INSTANCE_NAME: /^[a-zA-Z][a-zA-Z0-9-]*[a-zA-Z0-9]$/,
} as const

/**
 * Universal validation utilities for multi-provider support
 * Centralizes common validation logic across all cloud providers
 */
export class CoreValidators {
    /**
     * Validates UUID format (RFC 4122)
     * @param id - The ID to validate
     * @returns true if valid UUID format
     */
    static isValidUUID(id: string): boolean {
        return typeof id === 'string' && CORE_VALIDATION_PATTERNS.UUID.test(id)
    }

    /**
     * Validates IPv4 address format
     * @param ip - The IP address to validate
     * @returns true if valid IPv4 format
     */
    static isValidIPv4(ip: string): boolean {
        return typeof ip === 'string' && CORE_VALIDATION_PATTERNS.IP_V4.test(ip)
    }

    /**
     * Validates dot-notation path format
     * @param path - The path to validate
     * @returns true if valid dot-notation path
     */
    static isValidPath(path: string): boolean {
        return typeof path === 'string' && CORE_VALIDATION_PATTERNS.PATH.test(path)
    }

    /**
     * Validates instance name format
     * @param name - The instance name to validate
     * @returns true if valid instance name
     */
    static isValidInstanceName(name: string): boolean {
        return typeof name === 'string' && 
               name.length > 0 && 
               name.length <= 63 && 
               CORE_VALIDATION_PATTERNS.INSTANCE_NAME.test(name)
    }
}