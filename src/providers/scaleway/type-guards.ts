/**
 * Scaleway-specific Type Guards using the generic architecture
 * Demonstrates how to extend the base type guard system for a specific provider
 * Enhanced with Zod validation for critical API responses
 */

import { z } from 'zod'
import { 
    TypeGuardBuilder, 
    CommonTypeGuards, 
    TypeGuardRegistry,
    ProviderTypeGuards 
} from '../../core/type-guards';

/**
 * Zod schemas for runtime validation of critical API responses
 */
const VolumeStatusSchema = z.enum(['available', 'in_use', 'creating', 'deleting', 'error'])
const VolumeClassSchema = z.enum(['sbs', 'bssd', 'lssd'])
const ScalewayZoneSchema = z.string().regex(/^[a-z]{2}-[a-z]{3}-[0-9]+$/)
const ScalewayRegionSchema = z.string().regex(/^[a-z]{2}-[a-z]{3}$/)

const VolumeResponseSchema = z.object({
    id: z.string().uuid().optional(),
    name: z.string().optional(),
    status: VolumeStatusSchema.optional(),
    specs: z.object({
        perfIops: z.number().positive().optional(),
        class: VolumeClassSchema.optional()
    }).optional()
})

const ServerResponseSchema = z.object({
    id: z.string().uuid().optional(),
    name: z.string().optional(),
    state: z.string().optional(),
    commercialType: z.string().optional(),
    rootVolume: z.object({
        volumeId: z.string().uuid().optional(),
        size: z.number().positive().optional()
    }).optional(),
    tags: z.array(z.string()).optional()
})

/**
 * Scaleway API response types
 */
export interface ScalewayVolumeResponse {
    id?: string;
    name?: string;
    status?: string;
    specs?: {
        perfIops?: number;
        class?: string;
    };
}

export interface ScalewayServerResponse {
    id?: string;
    name?: string;
    state?: string;
    commercialType?: string;
    rootVolume?: {
        volumeId?: string;
        size?: number;
    };
    tags?: string[];
}

export interface ScalewayInstanceStatus {
    server?: ScalewayServerResponse;
}

/**
 * Scaleway-specific type guards using hybrid Zod + TypeScript approach
 * Optimized for both runtime safety and compile-time performance
 */
export const ScalewayTypeGuards = {
    /**
     * Validates Scaleway volume response with Zod + TypeScript hybrid approach
     * Fast compile-time checking with runtime validation for critical paths
     */
    volumeResponse: (obj: unknown): obj is ScalewayVolumeResponse => {
        // Fast path: basic structure check
        if (typeof obj !== 'object' || obj === null) return false;
        
        // Runtime validation for critical API responses only (when strictValidation flag is set)
        if (process.env.NODE_ENV === 'test' || (globalThis as any).__CLOUDYPAD_STRICT_VALIDATION__) {
            return VolumeResponseSchema.safeParse(obj).success;
        }
        
        // Standard compile-time validation for production
        const candidate = obj as Record<string, unknown>;
        return (
            (!candidate.id || typeof candidate.id === 'string') &&
            (!candidate.name || typeof candidate.name === 'string') &&
            (!candidate.status || typeof candidate.status === 'string') &&
            (!candidate.specs || (typeof candidate.specs === 'object' && candidate.specs !== null))
        );
    },

    /**
     * Validates Scaleway volume with performance IOPS using strict narrowing
     */
    volumeWithIOPS: (obj: unknown): obj is ScalewayVolumeResponse & { specs: { perfIops: number } } => {
        if (!ScalewayTypeGuards.volumeResponse(obj)) return false;
        const volume = obj as ScalewayVolumeResponse;
        return Boolean(volume.specs?.perfIops && 
                      typeof volume.specs.perfIops === 'number' && 
                      volume.specs.perfIops > 0);
    },

    /**
     * Validates Scaleway volume status with strict typing
     */
    volumeStatus: (obj: unknown): obj is { status: 'available' | 'in_use' | 'creating' | 'deleting' | 'error' } => {
        if (typeof obj !== 'object' || obj === null || !('status' in obj)) return false;
        const candidate = obj as Record<string, unknown>;
        const validStatuses: readonly string[] = ['available', 'in_use', 'creating', 'deleting', 'error'];
        return typeof candidate.status === 'string' && validStatuses.includes(candidate.status);
    },

    /**
     * Validates Scaleway volume specs with strict class typing
     */
    volumeSpecs: (obj: unknown): obj is { specs: { class: 'sbs' | 'bssd' | 'lssd' } } => {
        if (typeof obj !== 'object' || obj === null || !('specs' in obj)) return false;
        const candidate = obj as Record<string, unknown>;
        if (typeof candidate.specs !== 'object' || candidate.specs === null || !('class' in candidate.specs)) return false;
        const specs = candidate.specs as Record<string, unknown>;
        const validClasses: readonly string[] = ['sbs', 'bssd', 'lssd'];
        return typeof specs.class === 'string' && validClasses.includes(specs.class);
    },

    /**
     * Validates Scaleway server response
     */
    server: TypeGuardBuilder.object<ScalewayServerResponse>({
        customValidator: (obj): boolean => {
            const rootVolume = obj.rootVolume as Record<string, unknown> | undefined
            return Boolean(rootVolume &&
                   typeof rootVolume === 'object' &&
                   typeof rootVolume.volumeId === 'string');
        },
        description: 'Scaleway Server Response'
    }),

    /**
     * Validates Scaleway server with root volume data
     */
    serverWithRootVolume: TypeGuardBuilder.object<ScalewayServerResponse>({
        customValidator: (obj): boolean => {
            const rootVolume = obj.rootVolume as { volumeId?: unknown }
            return rootVolume &&
                   typeof rootVolume === 'object' &&
                   rootVolume !== null &&
                   typeof rootVolume.volumeId === 'string';
        },
        description: 'Scaleway Server with Root Volume'
    }),

    /**
     * Validates Scaleway instance status response
     */
    instanceStatus: TypeGuardBuilder.object<ScalewayInstanceStatus>({
        customValidator: (obj): boolean => {
            // Validate server state if present
            if (obj.server) {
                const validStates = ['running', 'stopped', 'stopping', 'starting', 'locked']
                if (typeof obj.state !== 'string' || !validStates.includes(obj.state)) return false;
            }
            return true;
        },
        description: 'Scaleway Instance Status'
    }),

    /**
     * Validates Scaleway zone format (e.g., "fr-par-1")
     */
    zone: (obj: unknown): obj is string => {
        if (!CommonTypeGuards.nonEmptyString(obj)) return false;
        const zoneRegex = /^[a-z]{2}-[a-z]{3}-[0-9]+$/;
        return zoneRegex.test(obj);
    },

    /**
     * Validates Scaleway region format (e.g., "fr-par")
     */
    region: (obj: unknown): obj is string => {
        if (!CommonTypeGuards.nonEmptyString(obj)) return false;
        const regionRegex = /^[a-z]{2}-[a-z]{3}$/;
        return regionRegex.test(obj);
    },

    /**
     * Validates Scaleway project ID (UUID format)
     */
    projectId: CommonTypeGuards.uuid,

    /**
     * Validates Scaleway resource tags
     */
    tags: TypeGuardBuilder.array(CommonTypeGuards.nonEmptyString),

    /**
     * Validates Scaleway snapshot name
     */
    snapshotName: (obj: unknown): obj is string => {
        if (!CommonTypeGuards.nonEmptyString(obj)) return false;
        return /^[a-zA-Z0-9-_]{1,63}$/.test(obj);
    },

    /**
     * Validates Scaleway commercial type (instance size)
     */
    commercialType: (obj: unknown): obj is string => {
        if (!CommonTypeGuards.nonEmptyString(obj)) return false;
        // Common Scaleway instance types pattern
        return /^[A-Z]+[0-9]+-[A-Z]+$/.test(obj);
    }
} satisfies ProviderTypeGuards;

/**
 * Convenience functions for common Scaleway validation patterns
 */
export const ScalewayValidators = {
    /**
     * Validates a complete Scaleway volume for snapshot operations
     */
    volumeForSnapshot: (obj: unknown): obj is ScalewayVolumeResponse => {
        return ScalewayTypeGuards.volumeResponse(obj) && 
               CommonTypeGuards.nonEmptyString((obj as ScalewayVolumeResponse).id) &&
               CommonTypeGuards.nonEmptyString((obj as ScalewayVolumeResponse).name);
    },

    /**
     * Validates a Scaleway server ready for operations
     */
    serverReady: (obj: unknown): obj is ScalewayServerResponse => {
        const server = obj as ScalewayServerResponse;
        return ScalewayTypeGuards.volumeResponse(obj) &&
               CommonTypeGuards.nonEmptyString(server.id) &&
               server.state === 'running';
    },

    /**
     * Validates Scaleway API error response
     */
    apiError: TypeGuardBuilder.object<{ message: string; type?: string; resource?: string }>({
        required: ['message'],
        customValidator: (obj) => {
            return CommonTypeGuards.nonEmptyString(obj.message);
        },
        description: 'Scaleway API Error Response'
    }),

    /**
     * Validates Scaleway configuration input
     */
    configInput: TypeGuardBuilder.object<{ 
        projectId: string; 
        zone: string; 
        region?: string; 
    }>({
        required: ['projectId', 'zone'],
        customValidator: (obj) => {
            return ScalewayTypeGuards.projectId(obj.projectId) &&
                   ScalewayTypeGuards.zone(obj.zone) &&
                   (!obj.region || ScalewayTypeGuards.region(obj.region));
        },
        description: 'Scaleway Configuration Input'
    })
};

// Register Scaleway type guards with the global registry
TypeGuardRegistry.register('scaleway', ScalewayTypeGuards);

/**
 * Helper function to get strongly-typed Scaleway guards
 */
export function getScalewayTypeGuards(): typeof ScalewayTypeGuards {
    const guards = TypeGuardRegistry.get('scaleway');
    if (!guards) {
        throw new Error('Scaleway type guards not registered');
    }
    return guards as typeof ScalewayTypeGuards;
}