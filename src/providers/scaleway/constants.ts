/**
 * Scaleway configuration constants and magic numbers
 * Centralizes all Scaleway-specific constants to eliminate magic numbers throughout the codebase
 */

/**
 * Scaleway API and SDK configuration constants
 */
export const SCALEWAY_API = {
    /** Block storage API version */
    BLOCK_API_VERSION: 'v1alpha1',
    
    /** Default region extraction pattern (zone.split('-').slice(0,2).join('-')) */
    REGION_ZONE_SPLIT_INDEX: 2,
} as const;

/**
 * Scaleway timeout and retry configuration
 */
export const SCALEWAY_TIMEOUTS = {
    /** Default timeout for instance start/stop operations (seconds) */
    INSTANCE_OPERATION_TIMEOUT: 300,
    
    /** Maximum retry attempts for volume deletion */
    VOLUME_DELETE_MAX_RETRIES: 10,
    
    /** Delay between volume deletion retry attempts (milliseconds) */
    VOLUME_DELETE_RETRY_DELAY: 3000,
    
    /** Timeout for waiting for volumes to become usable (milliseconds) */
    VOLUME_USABLE_WAIT_TIMEOUT: 120_000,
    
    /** Timeout for volume attachment operations (milliseconds) */
    VOLUME_ATTACH_TIMEOUT: 60_000,
} as const;

/**
 * Scaleway validation constants
 */
export const SCALEWAY_VALIDATION = {
    /** Maximum length for snapshot names */
    SNAPSHOT_NAME_MAX_LENGTH: 63,
    
    /** Valid characters pattern for snapshot names */
    SNAPSHOT_NAME_PATTERN: /^[a-zA-Z0-9-_]{1,63}$/,
    
    /** UUID validation pattern for Scaleway resources */
    UUID_PATTERN: /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
} as const;

/**
 * Scaleway volume and storage configuration
 */
export const SCALEWAY_STORAGE = {
    /** Default IOPS for block volumes when not specified */
    DEFAULT_VOLUME_IOPS: 5000,
    
    /** Volume types for block storage */
    VOLUME_TYPES: {
        SBS: 'sbs',
        LOCAL: 'local',
        /** For instance attachment API */
        SBS_VOLUME: 'sbs_volume' as const,
        BLOCK_SSD: 'b_ssd' as const,
    } as const,
    
    /** Standard tags applied to Cloudypad resources */
    CLOUDYPAD_TAGS: {
        CLOUDYPAD: 'cloudypad',
        DATA_DISK: 'data-disk',
        RESTORED_FROM_PREFIX: 'restoredFrom:',
        STACK_PREFIX: 'stack:',
    } as const,
} as const;

/**
 * Scaleway error patterns and retry logic
 */
export const SCALEWAY_ERRORS = {
    /** HTTP status codes that indicate retryable errors */
    RETRYABLE_HTTP_CODES: [404, 412] as const,
    
    /** Error message patterns that indicate retryable conditions */
    RETRYABLE_PATTERNS: [
        'in_use',
        'protected_resource',
        'ResourceNotFoundError',
        'instance_volume',
        'network',
        'timeout',
        'temporary'
    ] as const,
    
    /** Error message patterns for resource conflicts */
    RESOURCE_CONFLICT_PATTERNS: [
        'in_use',
        'protected_resource', 
        '412'
    ] as const,
    
    /** Error message patterns for not found errors */
    NOT_FOUND_PATTERNS: [
        'ResourceNotFoundError',
        'instance_volume',
        '404'
    ] as const,
} as const;

/**
 * Scaleway instance states and status
 */
export const SCALEWAY_INSTANCE = {
    /** Valid instance states from Scaleway API */
    STATES: {
        RUNNING: 'running',
        STOPPED: 'stopped',
        STOPPING: 'stopping',
        STARTING: 'starting',
    } as const,
} as const;

/**
 * Type-safe accessor for volume types
 */
export type ScalewayVolumeType = typeof SCALEWAY_STORAGE.VOLUME_TYPES[keyof typeof SCALEWAY_STORAGE.VOLUME_TYPES];

/**
 * Type-safe accessor for instance states
 */
export type ScalewayInstanceState = typeof SCALEWAY_INSTANCE.STATES[keyof typeof SCALEWAY_INSTANCE.STATES];

/**
 * Configuration validation helper
 */
export class ScalewayConfigValidator {
    /**
     * Validates that all required constants are properly configured
     * @returns true if configuration is valid
     * @throws Error if configuration is invalid
     */
    static validateConfig(): boolean {
        // Validate timeout values are positive
        if (SCALEWAY_TIMEOUTS.INSTANCE_OPERATION_TIMEOUT <= 0) {
            throw new Error('INSTANCE_OPERATION_TIMEOUT must be positive');
        }
        
        if (SCALEWAY_TIMEOUTS.VOLUME_DELETE_MAX_RETRIES <= 0) {
            throw new Error('VOLUME_DELETE_MAX_RETRIES must be positive');
        }
        
        if (SCALEWAY_TIMEOUTS.VOLUME_DELETE_RETRY_DELAY <= 0) {
            throw new Error('VOLUME_DELETE_RETRY_DELAY must be positive');
        }
        
        // Validate IOPS value
        if (SCALEWAY_STORAGE.DEFAULT_VOLUME_IOPS <= 0) {
            throw new Error('DEFAULT_VOLUME_IOPS must be positive');
        }
        
        return true;
    }
    
    /**
     * Gets region from zone using Scaleway naming convention
     * @param zone - Scaleway zone (e.g., "fr-par-1")
     * @returns Region (e.g., "fr-par")
     */
    static getRegionFromZone(zone: string): string {
        return zone.split('-').slice(0, SCALEWAY_API.REGION_ZONE_SPLIT_INDEX).join('-');
    }
}