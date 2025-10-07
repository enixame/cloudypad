/**
 * Scaleway-specific test constants interface and implementations
 * Type-safe test constants with enhanced compile-time guarantees
 */

import { UUID, IPv4Address, InstanceName } from '../../../core/types/branded'
import { ScalewayProjectId, ScalewayRegion, ScalewayZone, ScalewayCommercialType } from './branded'

/**
 * Type-safe test constants interface for Scaleway
 * Replaces generic Record<string, unknown> with specific branded types
 */
export interface ScalewayTestConstants {
    readonly DEFAULT_PROJECT_ID: ScalewayProjectId
    readonly DEFAULT_REGION: ScalewayRegion
    readonly DEFAULT_ZONE: ScalewayZone
    readonly DEFAULT_HOST: IPv4Address
    readonly DEFAULT_DATA_DISK_ID: UUID
    readonly DEFAULT_INSTANCE_SERVER_ID: string
    readonly DEFAULT_SSH_USER: string
    readonly DEFAULT_SSH_KEY_PATH: string
    readonly DEFAULT_DISK_SIZE_GB: number
    readonly DEFAULT_DATA_DISK_SIZE_GB: number
    readonly DEFAULT_PASSWORD_BASE64: string
    readonly DEFAULT_USERNAME: string
    readonly DEFAULT_COMMERCIAL_TYPE: ScalewayCommercialType
    readonly DEFAULT_SERVER_NAME: InstanceName
    readonly DEFAULT_SNAPSHOT_NAME: string
    readonly [key: string]: unknown
}

/**
 * Generic test constants interface for multi-provider support
 * Ensures all provider test constants have minimum required fields
 */
export interface TestConstants {
    readonly DEFAULT_PROJECT_ID: string | UUID | ScalewayProjectId
    readonly DEFAULT_REGION: string | ScalewayRegion
    readonly DEFAULT_ZONE: string | ScalewayZone
    readonly DEFAULT_HOST: string | IPv4Address
    readonly [key: string]: unknown
}