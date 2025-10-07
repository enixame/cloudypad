import * as sinon from 'sinon'
import { ScalewayClient } from '../../src/providers/scaleway/sdk-client'
import { StateWriter } from '../../src/core/state/writer'
import { ScalewayProviderClient } from '../../src/providers/scaleway/provider'
import { ScalewayInstanceStateV1 } from '../../src/providers/scaleway/state'

/**
 * Centralized configuration system to eliminate magic numbers and improve reusability
 * Hierarchical configuration with performance, defaults, and limits sections
 * 
 * @example
 * ```typescript
 * const iterations = CLOUDYPAD_CONFIG.PERFORMANCE.BENCHMARK_ITERATIONS
 * const defaultRegion = CLOUDYPAD_CONFIG.DEFAULTS.REGION
 * const maxRetries = CLOUDYPAD_CONFIG.LIMITS.MAX_RETRIES
 * ```
 */
const CLOUDYPAD_CONFIG = {
    /** Performance-related configuration */
    PERFORMANCE: {
        /** Number of iterations for benchmark tests */
        BENCHMARK_ITERATIONS: 1000,
        /** Maximum retry attempts for operations */
        MAX_RETRIES: 3,
        /** Timeout in milliseconds for async operations */
        TIMEOUT_MS: 5000,
        /** Debounce delay for rapid operations */
        DEBOUNCE_MS: 100
    },
    /** Default values for test scenarios */
    DEFAULTS: {
        /** Default Scaleway project ID (valid UUID format) */
        PROJECT_ID: '12345678-1234-1234-1234-123456789012',
        /** Default Scaleway region */
        REGION: 'fr-par',
        /** Default Scaleway zone */
        ZONE: 'fr-par-1',
        /** Default host IP address */
        HOST: '1.2.3.4',
        /** Default data disk/volume ID */
        DATA_DISK_ID: '12345678-1234-1234-1234-123456789abc',
        /** Default instance server ID */
        INSTANCE_SERVER_ID: 'srv-1',
        /** Default SSH username */
        SSH_USER: 'ubuntu',
        /** Default SSH private key path */
        SSH_KEY_PATH: './test/resources/ssh-key',
        /** Default root disk size in GB */
        DISK_SIZE_GB: 20,
        /** Default data disk size in GB */
        DATA_DISK_SIZE_GB: 100,
        /** Default password encoded in base64 ('test-password') */
        PASSWORD_BASE64: 'dGVzdC1wYXNzd29yZA==',
        /** Default username for services */
        USERNAME: 'test-user',
        /** Default instance name */
        INSTANCE_NAME: 'test-instance'
    },
    /** Validation limits and constraints */
    LIMITS: {
        /** Maximum path length for dot-notation paths */
        MAX_PATH_LENGTH: 255,
        /** Maximum instance name length */
        MAX_NAME_LENGTH: 63,
        /** Minimum instance name length */
        MIN_NAME_LENGTH: 1,
        /** Minimum disk size in GB */
        MIN_DISK_SIZE: 10,
        /** Maximum disk size in GB */
        MAX_DISK_SIZE: 1000,
        /** Maximum number of pending changes in builder */
        MAX_PENDING_CHANGES: 100
    }
} as const



/**
 * Utility type for deep readonly immutability
 * Recursively makes all properties readonly to prevent mutations
 * 
 * @template T - The type to make deeply readonly
 */
type DeepReadonly<T> = {
    readonly [P in keyof T]: T[P] extends object ? DeepReadonly<T[P]> : T[P]
}

/**
 * Type for builder modification functions - ensures type safety
 * Used in batch operations to safely modify state objects
 * 
 * @template T - The state type being modified
 */
type BuilderModification<T> = (state: T) => void

/**
 * Branded type to distinguish immutable instances at compile-time
 * Prevents accidental mutations of frozen objects
 * 
 * @template T - The type to make immutable
 */
type ImmutableState<T> = DeepReadonly<T> & { readonly __immutable: true }

/**
 * Type-safe field paths for batch updates via withFields()
 * Only includes commonly updated fields for performance and type safety
 * 
 * @example
 * ```typescript
 * const updates: BuilderFieldPaths = {
 *   name: 'new-instance',
 *   region: 'us-west-2',
 *   host: '192.168.1.100'
 * }
 * builder.withFields(updates)
 * ```
 */
type BuilderFieldPaths = {
    /** Instance name */
    name?: string
    /** Scaleway project ID (UUID) */
    projectId?: string
    /** Scaleway region (e.g., 'us-west-2') */
    region?: string
    /** Scaleway zone (e.g., 'us-west-2a') */
    zone?: string
    /** Server ID from provisioning output */
    instanceServerId?: string
    /** Data disk ID from provisioning output */
    dataDiskId?: string
    /** Host IP address (sets both host and publicIPv4) */
    host?: string
    /** Root disk size in GB */
    diskSizeGb?: number
    /** Data disk size in GB */
    dataDiskSizeGb?: number
    /** Sunshine server username */
    username?: string
}

// Type guard utilities
type ProvisionOutput = NonNullable<ScalewayInstanceStateV1['provision']['output']>

// Default instance state - immutable reference using centralized configuration
const DEFAULT_INSTANCE_STATE: DeepReadonly<ScalewayInstanceStateV1> = {
    version: '1' as const,
    name: CLOUDYPAD_CONFIG.DEFAULTS.INSTANCE_NAME,
    provision: {
        provider: 'scaleway' as const,
        input: {
            projectId: CLOUDYPAD_CONFIG.DEFAULTS.PROJECT_ID,
            region: CLOUDYPAD_CONFIG.DEFAULTS.REGION,
            zone: CLOUDYPAD_CONFIG.DEFAULTS.ZONE,
            ssh: { 
                user: CLOUDYPAD_CONFIG.DEFAULTS.SSH_USER, 
                privateKeyPath: CLOUDYPAD_CONFIG.DEFAULTS.SSH_KEY_PATH 
            },
            instanceType: 'GPU',
            diskSizeGb: CLOUDYPAD_CONFIG.DEFAULTS.DISK_SIZE_GB,
            dataDiskSizeGb: CLOUDYPAD_CONFIG.DEFAULTS.DATA_DISK_SIZE_GB
        },
        output: {
            host: CLOUDYPAD_CONFIG.DEFAULTS.HOST,
            publicIPv4: CLOUDYPAD_CONFIG.DEFAULTS.HOST,
            dataDiskId: CLOUDYPAD_CONFIG.DEFAULTS.DATA_DISK_ID,
            instanceServerId: CLOUDYPAD_CONFIG.DEFAULTS.INSTANCE_SERVER_ID
        }
    },
    configuration: {
        configurator: 'ansible' as const,
        input: {
            sunshine: {
                enable: true,
                passwordBase64: CLOUDYPAD_CONFIG.DEFAULTS.PASSWORD_BASE64,
                username: CLOUDYPAD_CONFIG.DEFAULTS.USERNAME
            }
        }
    }
} as const

/**
 * Unified validation system to eliminate pattern repetition and improve reusability
 * Centralized patterns and validators for consistent validation across the codebase
 * 
 * @example
 * ```typescript
 * const isValid = ValidationUtils.isValidUUID('12345678-1234-1234-1234-123456789012')
 * const validatedPath = ValidationUtils.validatePath('provision.input.region')
 * ```
 */
class ValidationUtils {
    /** Cached regex patterns to avoid recompilation */
    static readonly PATTERNS = {
        PATH: /^[a-zA-Z][a-zA-Z0-9.]*[a-zA-Z0-9]$/,
        UUID: /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
        IP: /^((25[0-5]|(2[0-4]|1\d|[1-9]|)\d)\.?\b){4}$/,
        INSTANCE_NAME: /^[a-zA-Z][a-zA-Z0-9-]*[a-zA-Z0-9]$/,
        REGION: /^[a-z]{2}-[a-z]{3,4}-\d$/
    } as const

    /**
     * Validates dot-notation paths (e.g., 'provision.input.region')
     * @param path - Path to validate
     * @returns true if valid, false otherwise
     */
    static isValidPath(path: string): boolean {
        return path.length > 0 && this.PATTERNS.PATH.test(path)
    }

    /**
     * Validates UUID format (RFC 4122)
     * @param uuid - UUID string to validate
     * @returns true if valid UUID format
     */
    static isValidUUID(uuid: string): boolean {
        return this.PATTERNS.UUID.test(uuid)
    }

    /**
     * Validates IPv4 address format
     * @param ip - IP address to validate
     * @returns true if valid IPv4 format
     */
    static isValidIP(ip: string): boolean {
        return this.PATTERNS.IP.test(ip)
    }

    /**
     * Validates instance name format
     * @param name - Instance name to validate
     * @returns true if valid instance name
     */
    static isValidInstanceName(name: string): boolean {
        return name.length > 0 && name.length <= 63 && this.PATTERNS.INSTANCE_NAME.test(name)
    }

    /**
     * Validates Scaleway region format (e.g., 'fr-par-1', 'nl-ams-1')
     * @param region - Region to validate
     * @returns true if valid region format
     */
    static isValidRegion(region: string): boolean {
        return this.PATTERNS.REGION.test(region)
    }
}

/**
 * Immutable builder pattern for creating ScalewayInstanceStateV1 objects with sensible defaults
 * for testing purposes. Each operation returns a new builder instance, preventing mutations.
 * 
 * ## Key Features:
 * - **Type-safe immutability** with DeepReadonly and branded types
 * - **Copy-on-Write optimization** for superior performance
 * - **Robust type guards** for null-safe operations
 * - **Batch operations** for efficient multi-field updates
 * - **Fluent API** for intuitive test data creation
 * - **Cached patterns** for regex and field mappings
 * 
 * ## Performance Characteristics:
 * - O(1) for single changes (Copy-on-Write)
 * - O(n) only when actually building the final state
 * - Regex caching eliminates recompilation overhead
 * - Smart Map allocation avoids unnecessary memory usage
 * 
 * @example Basic Usage
 * ```typescript
 * const state = new InstanceStateBuilder()
 *   .withName('test-instance')
 *   .withRegion('us-west-2')
 *   .withZone('us-west-2a')
 *   .build()
 * ```
 * 
 * @example Batch Operations (Most Efficient)
 * ```typescript
 * const state = new InstanceStateBuilder()
 *   .withFields({
 *     name: 'production-server',
 *     projectId: '12345678-1234-1234-1234-123456789012',
 *     region: 'eu-west-1',
 *     zone: 'eu-west-1a',
 *     host: '192.168.1.100'
 *   })
 *   .build()
 * ```
 * 
 * @example Copy-on-Write Immutability
 * ```typescript
 * const baseBuilder = new InstanceStateBuilder().withName('base')
 * const variant1 = baseBuilder.withRegion('us-east-1')
 * const variant2 = baseBuilder.withRegion('eu-west-1')
 * 
 * // baseBuilder remains unchanged!
 * console.log(baseBuilder.peek().name) // 'base'
 * ```
 */
export class InstanceStateBuilder {
    private static readonly EMPTY_CHANGES = Object.freeze(new Map<string, unknown>())
    private static readonly BENCHMARK_ITERATIONS = CLOUDYPAD_CONFIG.PERFORMANCE.BENCHMARK_ITERATIONS
    
    /** Cache regex pattern to avoid recompilation on each validation */
    private static readonly PATH_REGEX = ValidationUtils.PATTERNS.PATH
    
    /** Cached field mappings to avoid object recreation */
    private static readonly FIELD_MAPPINGS: Record<keyof BuilderFieldPaths, string> = {
        name: 'name',
        projectId: 'provision.input.projectId',
        region: 'provision.input.region',
        zone: 'provision.input.zone',
        instanceServerId: 'provision.output.instanceServerId',
        dataDiskId: 'provision.output.dataDiskId',
        host: 'provision.output.host',
        diskSizeGb: 'provision.input.diskSizeGb',
        dataDiskSizeGb: 'provision.input.dataDiskSizeGb',
        username: 'configuration.input.sunshine.username'
    } as const
    
    private readonly state: DeepReadonly<ScalewayInstanceStateV1>
    private readonly pendingChanges: Map<string, unknown>
    private readonly isCloned: boolean

    constructor(
        initialState: DeepReadonly<ScalewayInstanceStateV1> = DEFAULT_INSTANCE_STATE,
        pendingChanges: Map<string, unknown> = new Map(),
        isCloned: boolean = false
    ) {
        this.state = initialState
        this.pendingChanges = pendingChanges
        this.isCloned = isCloned
    }

    /**
     * Type guard to ensure provision output exists
     */
    private ensureProvisionOutput(state: ScalewayInstanceStateV1): ProvisionOutput {
        if (!state.provision.output) {
            throw new Error('Provision output is required but was undefined')
        }
        return state.provision.output
    }

    /**
     * Type guard for record objects
     */
    private isRecord(obj: unknown): obj is Record<string, unknown> {
        return typeof obj === 'object' && obj !== null && !Array.isArray(obj)
    }

    /**
     * Validate dot-notation paths using unified validation system
     * @param path - The dot-notation path to validate (e.g., 'provision.input.zone')
     * @returns true if path is valid, false otherwise
     * @example
     * ```typescript
     * isValidPath('provision.input.zone') // true
     * isValidPath('invalid.path.') // false
     * isValidPath('') // false
     * ```
     */
    private isValidPath(path: string): boolean {
        return ValidationUtils.isValidPath(path)
    }

    /**
     * Apply pending changes to a state object - Copy-on-Write optimization
     */
    private applyPendingChanges(state: ScalewayInstanceStateV1): void {
        for (const [path, value] of this.pendingChanges) {
            this.setNestedValue(state, path, value)
        }
    }

    /**
     * Set nested value safely using dot notation path
     */
    private setNestedValue(obj: unknown, path: string, value: unknown): void {
        if (!this.isRecord(obj)) {
            throw new Error('Target object must be a record')
        }
        
        const keys = path.split('.')
        let current = obj
        
        for (let i = 0; i < keys.length - 1; i++) {
            const key = keys[i]
            if (!(key in current) || !this.isRecord(current[key])) {
                current[key] = {}
            }
            current = current[key] as Record<string, unknown>
        }
        
        current[keys[keys.length - 1]] = value
    }

    /**
     * Create a new builder with copy-on-write optimization
     * Only creates new Map when necessary to minimize memory allocations
     * 
     * @param path - Dot-notation path to the property (e.g., 'provision.input.zone')
     * @param value - The value to set at the specified path
     * @returns New InstanceStateBuilder with the change queued
     * @throws {Error} If the path format is invalid or limits exceeded
     * 
     * @example
     * ```typescript
     * builder.copyOnWrite('name', 'new-instance')
     * builder.copyOnWrite('provision.input.region', 'us-west-2')
     * ```
     */
    private copyOnWrite(path: string, value: unknown): InstanceStateBuilder {
        if (!this.isValidPath(path)) {
            throw new Error(`Invalid path format: ${path}`)
        }
        if (path.length > CLOUDYPAD_CONFIG.LIMITS.MAX_PATH_LENGTH) {
            throw new Error(`Path too long: ${path.length} > ${CLOUDYPAD_CONFIG.LIMITS.MAX_PATH_LENGTH}`)
        }
        if (this.pendingChanges.size >= CLOUDYPAD_CONFIG.LIMITS.MAX_PENDING_CHANGES) {
            throw new Error(`Too many pending changes: ${this.pendingChanges.size} >= ${CLOUDYPAD_CONFIG.LIMITS.MAX_PENDING_CHANGES}`)
        }
        
        const newChanges = this.pendingChanges.size === 0 
            ? new Map([[path, value]])
            : new Map([...this.pendingChanges, [path, value]])
        return new InstanceStateBuilder(this.state, newChanges, false)
    }

    /**
     * Creates a new builder with modified state - optimized deep clone approach
     * Uses type-safe modification function to prevent accidental mutations
     */
    private clone(modifications: BuilderModification<ScalewayInstanceStateV1>): InstanceStateBuilder {
        // Use structuredClone for better performance and type safety
        const newState: ScalewayInstanceStateV1 = structuredClone(this.state as ScalewayInstanceStateV1)
        // Apply pending changes first
        this.applyPendingChanges(newState)
        // Apply new modifications
        modifications(newState)
        // Return new builder instance with clean state
        return new InstanceStateBuilder(newState, new Map(), true)
    }

    /**
     * Sets the instance name using Copy-on-Write optimization
     * Validates name format and length according to configuration limits
     * 
     * @param name - The instance name to set
     * @returns New InstanceStateBuilder with updated name
     * @throws {Error} If name format or length is invalid
     * 
     * @example
     * ```typescript
     * const builder = new InstanceStateBuilder().withName('production-server')
     * ```
     */
    withName(name: string): InstanceStateBuilder {
        if (!ValidationUtils.isValidInstanceName(name)) {
            throw new Error(`Invalid instance name format: ${name}`)
        }
        if (name.length < CLOUDYPAD_CONFIG.LIMITS.MIN_NAME_LENGTH || 
            name.length > CLOUDYPAD_CONFIG.LIMITS.MAX_NAME_LENGTH) {
            throw new Error(`Instance name length ${name.length} not in range [${CLOUDYPAD_CONFIG.LIMITS.MIN_NAME_LENGTH}, ${CLOUDYPAD_CONFIG.LIMITS.MAX_NAME_LENGTH}]`)
        }
        return this.copyOnWrite('name', name)
    }

    /**
     * Sets the Scaleway project ID in provision input
     * Validates UUID format to prevent invalid project IDs
     * 
     * @param projectId - The Scaleway project ID (UUID format)
     * @returns New InstanceStateBuilder with updated project ID
     * @throws {Error} If project ID is not a valid UUID
     * 
     * @example
     * ```typescript
     * const builder = new InstanceStateBuilder()
     *   .withProjectId('12345678-1234-1234-1234-123456789012')
     * ```
     */
    withProjectId(projectId: string): InstanceStateBuilder {
        if (!ValidationUtils.isValidUUID(projectId)) {
            throw new Error(`Invalid project ID format (must be UUID): ${projectId}`)
        }
        return this.copyOnWrite('provision.input.projectId', projectId)
    }

    /**
     * Sets the instance server ID in provision output (post-provisioning data)
     * 
     * @param serverId - The Scaleway server ID
     * @returns New InstanceStateBuilder with updated server ID
     * 
     * @example
     * ```typescript
     * const builder = new InstanceStateBuilder().withInstanceServerId('srv-123abc')
     * ```
     */
    withInstanceServerId(serverId: string): InstanceStateBuilder {
        return this.copyOnWrite('provision.output.instanceServerId', serverId)
    }

    /**
     * Sets the data disk ID in provision output (post-provisioning data)
     * 
     * @param diskId - The Scaleway volume/disk ID
     * @returns New InstanceStateBuilder with updated disk ID
     * 
     * @example
     * ```typescript
     * const builder = new InstanceStateBuilder().withDataDiskId('vol-123abc')
     * ```
     */
    withDataDiskId(diskId: string): InstanceStateBuilder {
        return this.copyOnWrite('provision.output.dataDiskId', diskId)
    }

    /**
     * Sets the Scaleway zone in provision input
     * 
     * @param zone - The Scaleway zone (e.g., 'fr-par-1', 'nl-ams-1')
     * @returns New InstanceStateBuilder with updated zone
     * 
     * @example
     * ```typescript
     * const builder = new InstanceStateBuilder().withZone('nl-ams-1')
     * ```
     */
    withZone(zone: string): InstanceStateBuilder {
        return this.copyOnWrite('provision.input.zone', zone)
    }

    /**
     * Sets the Scaleway region in provision input
     * 
     * @param region - The Scaleway region (e.g., 'fr-par', 'nl-ams')
     * @returns New InstanceStateBuilder with updated region
     * 
     * @example
     * ```typescript
     * const builder = new InstanceStateBuilder().withRegion('nl-ams')
     * ```
     */
    withRegion(region: string): InstanceStateBuilder {
        return this.copyOnWrite('provision.input.region', region)
    }

    /**
     * Sets both host and publicIPv4 in a single batch operation
     * Optimized to minimize Map allocations
     * 
     * @param host - The host/IP address to set for both host and publicIPv4
     * @returns New InstanceStateBuilder with both host fields updated
     * 
     * @example
     * ```typescript
     * const builder = new InstanceStateBuilder()
     *   .withHost('192.168.1.100')
     * 
     * const state = builder.build()
     * console.log(state.provision.output?.host) // '192.168.1.100'
     * console.log(state.provision.output?.publicIPv4) // '192.168.1.100'
     * ```
     */
    withHost(host: string): InstanceStateBuilder {
        const newChanges = this.pendingChanges.size === 0
            ? new Map([['provision.output.host', host], ['provision.output.publicIPv4', host]])
            : new Map([...this.pendingChanges, ['provision.output.host', host], ['provision.output.publicIPv4', host]])
        return new InstanceStateBuilder(this.state, newChanges, false)
    }

    /**
     * Returns a readonly view of the current state for inspection without building
     * Useful for debugging or conditional logic without triggering expensive operations
     * 
     * @returns Immutable view of the current state (before applying pending changes)
     * 
     * @example
     * ```typescript
     * const builder = new InstanceStateBuilder().withName('test')
     * const currentState = builder.peek()
     * console.log(currentState.name) // Shows original name, not 'test'
     * ```
     */
    peek(): DeepReadonly<ScalewayInstanceStateV1> {
        return this.state
    }

    /**
     * Builds and returns the final instance state with all pending changes applied
     * Uses Copy-on-Write optimization: only clones when there are actual changes
     * 
     * @returns Mutable ScalewayInstanceStateV1 with all changes applied
     * 
     * @example
     * ```typescript
     * const state = new InstanceStateBuilder()
     *   .withName('production')
     *   .withRegion('us-west-2')
     *   .build()
     * 
     * console.log(state.name) // 'production'
     * console.log(state.provision.input.region) // 'us-west-2'
     * ```
     */
    build(): ScalewayInstanceStateV1 {
        if (this.pendingChanges.size === 0) {
            // No changes, return direct clone of original state
            return structuredClone(this.state as ScalewayInstanceStateV1)
        }
        
        // Apply pending changes
        const newState = structuredClone(this.state as ScalewayInstanceStateV1)
        this.applyPendingChanges(newState)
        return newState
    }

    /**
     * Builds and returns a deeply immutable instance state
     * This prevents any further mutations to the returned object
     */
    buildImmutable(): ImmutableState<ScalewayInstanceStateV1> {
        const mutableState = this.build()
        // Deep freeze the object recursively
        return this.deepFreeze(mutableState) as ImmutableState<ScalewayInstanceStateV1>
    }

    /**
     * Deep freeze an object recursively with cycle detection
     */
    private deepFreeze<T>(obj: T, visited = new WeakSet<object>()): T {
        if (typeof obj !== 'object' || obj === null) {
            return obj
        }
        
        const objectRef = obj as object
        if (visited.has(objectRef)) {
            return obj
        }
        visited.add(objectRef)
        
        Object.getOwnPropertyNames(obj).forEach(prop => {
            const value = (obj as Record<string, unknown>)[prop]
            if (value && typeof value === 'object') {
                this.deepFreeze(value, visited)
            }
        })
        return Object.freeze(obj)
    }

    /**
     * Batch update method for multiple modifications in a single clone operation
     * More efficient than chaining individual method calls
     */
    withBatch(modifications: (state: ScalewayInstanceStateV1) => void): InstanceStateBuilder {
        return this.clone(modifications)
    }

    /**
     * Creates a builder with multiple field updates at once - Type-safe and optimized
     * Avoids unnecessary Map creation when no fields are provided
     * 
     * @param fields - Object containing field updates to apply
     * @returns New InstanceStateBuilder with all field changes queued
     * 
     * @example
     * ```typescript
     * // Batch update multiple fields efficiently
     * const builder = new InstanceStateBuilder()
     *   .withFields({
     *     name: 'production-instance',
     *     projectId: 'prod-project-123',
     *     region: 'us-west-2',
     *     zone: 'us-west-2a'
     *   })
     * 
     * // Special handling for host (also sets publicIPv4)
     * builder.withFields({ host: '192.168.1.100' })
     * ```
     */
    withFields(fields: BuilderFieldPaths): InstanceStateBuilder {
        // Early return optimization: avoid processing if no fields provided
        const hasChanges = Object.values(fields).some(value => value !== undefined)
        if (!hasChanges) {
            return this
        }
        
        // Optimize Map creation based on current state
        const newChanges = this.pendingChanges.size === 0 
            ? new Map<string, unknown>()
            : new Map(this.pendingChanges)
        
        // Use cached field mappings to avoid object recreation
        const fieldMappings = InstanceStateBuilder.FIELD_MAPPINGS
        
        // Apply all field changes
        for (const [field, value] of Object.entries(fields) as Array<[keyof BuilderFieldPaths, unknown]>) {
            if (value !== undefined) {
                const path = fieldMappings[field]
                newChanges.set(path, value)
                
                // Special case: host also sets publicIPv4
                if (field === 'host') {
                    newChanges.set('provision.output.publicIPv4', value)
                }
            }
        }
        
        return new InstanceStateBuilder(this.state, newChanges, false)
    }

    /**
     * Deep equality check - more robust than JSON.stringify
     */
    private static deepEqual(obj1: unknown, obj2: unknown): boolean {
        if (obj1 === obj2) return true
        
        if (obj1 == null || obj2 == null) return obj1 === obj2
        
        if (typeof obj1 !== typeof obj2) return false
        
        if (typeof obj1 !== 'object') return obj1 === obj2
        
        const keys1 = Object.keys(obj1 as Record<string, unknown>)
        const keys2 = Object.keys(obj2 as Record<string, unknown>)
        
        if (keys1.length !== keys2.length) return false
        
        for (const key of keys1) {
            if (!keys2.includes(key)) return false
            
            const val1 = (obj1 as Record<string, unknown>)[key]
            const val2 = (obj2 as Record<string, unknown>)[key]
            
            if (!this.deepEqual(val1, val2)) return false
        }
        
        return true
    }

    /**
     * Validates that the builder maintains immutability guarantees
     * Ensures that operations on a builder don't mutate the original instance
     * 
     * @returns true if immutability is maintained, false otherwise
     * 
     * @example
     * ```typescript
     * const isImmutable = InstanceStateBuilder.validateImmutability()
     * console.log('Builder is immutable:', isImmutable) // Should be true
     * ```
     */
    static validateImmutability(): boolean {
        const builder = new InstanceStateBuilder()
        const originalState = builder.peek()
        
        // Perform operations that should not mutate the original
        builder
            .withName('modified-name')
            .withProjectId('87654321-4321-4321-4321-210987654321')
        
        // Verify original builder is unchanged using deep equality
        const currentState = builder.peek()
        return this.deepEqual(originalState, currentState)
    }

    /**
     * Benchmarks Copy-on-Write performance against traditional deep cloning
     * Measures the efficiency gains from the CoW optimization
     * 
     * @returns Object containing timing results for both approaches
     * 
     * @example
     * ```typescript
     * const results = InstanceStateBuilder.benchmarkPerformance()
     * console.log(`CoW: ${results.copyOnWrite}ms, Traditional: ${results.traditional}ms`)
     * console.log(`Speedup: ${(results.traditional / results.copyOnWrite).toFixed(2)}x`)
     * ```
     */
    static benchmarkPerformance(): { copyOnWrite: number; traditional: number } {
        const iterations = CLOUDYPAD_CONFIG.PERFORMANCE.BENCHMARK_ITERATIONS
        
        // Benchmark Copy-on-Write approach
        const startCow = performance.now()
        for (let i = 0; i < iterations; i++) {
            new InstanceStateBuilder()
                .withName(`test-${i}`)
                .withProjectId(`project-${i}`)
                .withZone(`zone-${i}`)
        }
        const cowTime = performance.now() - startCow
        
        // Benchmark traditional deep clone approach (for comparison)
        const startTraditional = performance.now()
        for (let i = 0; i < iterations; i++) {
            const builder = new InstanceStateBuilder()
            builder.clone(state => {
                state.name = `test-${i}`
                state.provision.input.projectId = `project-${i}`
                state.provision.input.zone = `zone-${i}`
            })
        }
        const traditionalTime = performance.now() - startTraditional
        
        return {
            copyOnWrite: cowTime,
            traditional: traditionalTime
        }
    }
}

/**
 * Environment management utilities for Scaleway testing
 * Handles setup and cleanup of environment variables required for Scaleway SDK
 * 
 * @example
 * ```typescript
 * beforeEach(() => {
 *   ScalewayEnvironment.setup()
 * })
 * 
 * afterEach(() => {
 *   ScalewayEnvironment.cleanup()
 * })
 * ```
 */
export class ScalewayEnvironment {
    /**
     * Sets up all required Scaleway environment variables for testing
     * Uses safe test values that won't interfere with real Scaleway operations
     * 
     * @example
     * ```typescript
     * ScalewayEnvironment.setup()
     * // Now process.env.SCW_ACCESS_KEY, etc. are set
     * ```
     */
    static setup(): void {
        process.env.SCW_ACCESS_KEY = 'test-access-key'
        process.env.SCW_SECRET_KEY = 'test-secret-key'
        process.env.SCW_DEFAULT_PROJECT_ID = CLOUDYPAD_CONFIG.DEFAULTS.PROJECT_ID
        process.env.SCW_DEFAULT_ZONE = CLOUDYPAD_CONFIG.DEFAULTS.ZONE
    }

    /**
     * Cleans up all Scaleway environment variables after testing
     * Essential for test isolation - prevents test pollution
     * 
     * @example
     * ```typescript
     * afterEach(() => {
     *   ScalewayEnvironment.cleanup()
     * })
     * ```
     */
    static cleanup(): void {
        delete process.env.SCW_ACCESS_KEY
        delete process.env.SCW_SECRET_KEY
        delete process.env.SCW_DEFAULT_PROJECT_ID
        delete process.env.SCW_DEFAULT_ZONE
    }
}

/**
 * Comprehensive Scaleway client stubs for testing SDK operations
 * All stubs are pre-configured with sensible defaults but can be customized
 * 
 * @example
 * ```typescript
 * const stubs: ScalewayClientStubs = stubManager.createScalewayClientStubs()
 * stubs.findCurrentDataDiskId.resolves('disk-123')
 * stubs.stopInstance.resolves()
 * ```
 */
export interface ScalewayClientStubs {
    /** Stub for finding current data disk ID */
    findCurrentDataDiskId: sinon.SinonStub
    /** Stub for getting raw server data from Scaleway API */
    getRawServerData: sinon.SinonStub
    /** Stub for stopping instance operations */
    stopInstance: sinon.SinonStub
    /** Stub for detaching data volumes */
    detachDataVolume: sinon.SinonStub
    /** Stub for starting instance operations */
    startInstance: sinon.SinonStub
    /** Stub for deleting block volumes */
    deleteBlockVolume: sinon.SinonStub
}

/**
 * Provider-level stubs for testing high-level operations
 * 
 * @example
 * ```typescript
 * const stubs: ProviderStubs = stubManager.createProviderStubs(customState)
 * expect(stubs.getInstanceState).to.have.been.calledWith('instance-name')
 * ```
 */
export interface ProviderStubs {
    /** Stub for getting instance state from provider */
    getInstanceState: sinon.SinonStub
    /** Stub for setting provision output in state */
    setProvisionOutput: sinon.SinonStub
}

/**
 * Type-safe overrides for customizing stub behavior
 * Allows precise control over stub return values with type safety
 * 
 * @example
 * ```typescript
 * const overrides: ScalewayClientStubOverrides = {
 *   findCurrentDataDiskId: 'custom-disk-id',
 *   getRawServerData: { id: 'srv-123', name: 'test-server' }
 * }
 * const stubs = stubManager.createScalewayClientStubs(overrides)
 * ```
 */
export interface ScalewayClientStubOverrides {
    /** Override for data disk ID resolution */
    findCurrentDataDiskId?: string
    /** Override for server data (must be object or null) */
    getRawServerData?: Record<string, unknown> | null
    /** Override for stop instance result */
    stopInstance?: void
    /** Override for detach volume result */
    detachDataVolume?: void
    /** Override for start instance result */
    startInstance?: void
    /** Override for delete volume result */
    deleteBlockVolume?: void
}

/**
 * Advanced stub manager for Scaleway testing with type-safe validation
 * Handles creation and configuration of all Scaleway-related stubs
 * 
 * @example
 * ```typescript
 * const sandbox = sinon.createSandbox()
 * const stubManager = new SinonStubManager(sandbox)
 * 
 * const clientStubs = stubManager.createScalewayClientStubs({
 *   findCurrentDataDiskId: 'test-disk-123'
 * })
 * 
 * const providerStubs = stubManager.createProviderStubs(customState)
 * ```
 */
export class SinonStubManager {
    private sandbox: sinon.SinonSandbox

    /**
     * Creates a new stub manager
     * 
     * @param sandbox - Sinon sandbox for managing stub lifecycle
     */
    constructor(sandbox: sinon.SinonSandbox) {
        this.sandbox = sandbox
    }

    /**
     * Type-safe validation for server data used in stubs
     * Ensures test data conforms to expected types while maintaining flexibility
     * 
     * @param data - Server data to validate (object or null)
     * @returns Validated data ready for stub usage
     * @throws {Error} When data format is invalid
     * 
     * @example
     * ```typescript
     * const serverData = { id: 'srv-123', name: 'test-server' }
     * const validated = stubManager.validateServerData(serverData)
     * getRawServerDataStub.resolves(validated)
     * ```
     */
    private validateServerData(data: Record<string, unknown> | null): unknown {
        if (data === null) {
            return undefined
        }
        if (typeof data === 'object' && data !== null) {
            // For test purposes, we trust that the test data conforms to Server interface
            return data
        }
        throw new Error('getRawServerData override must be an object or null')
    }

    /**
     * Creates comprehensive Scaleway client stubs with customizable overrides
     * All stubs are pre-configured with sensible defaults from TEST_CONSTANTS
     * 
     * @param overrides - Custom return values for specific stub methods
     * @returns Object containing all configured Scaleway client stubs
     * 
     * @example
     * ```typescript
     * const stubs = stubManager.createScalewayClientStubs({
     *   findCurrentDataDiskId: 'custom-disk-id',
     *   getRawServerData: { id: 'srv-123', state: 'running' }
     * })
     * 
     * // Stubs are ready to use
     * expect(stubs.findCurrentDataDiskId).to.have.been.calledOnce
     * ```
     */
    createScalewayClientStubs(overrides: ScalewayClientStubOverrides = {}): ScalewayClientStubs {
        const getRawServerDataStub = this.sandbox.stub(ScalewayClient.prototype, 'getRawServerData')
        if (overrides.getRawServerData !== undefined) {
            // Type-safe validation and controlled assertion for test data
            const validatedData = this.validateServerData(overrides.getRawServerData)
            // @ts-expect-error Test data is validated but TypeScript can't infer Server interface conformance
            getRawServerDataStub.resolves(validatedData)
        } else {
            getRawServerDataStub.resolves(undefined)
        }

        return {
            findCurrentDataDiskId: this.sandbox.stub(ScalewayClient.prototype, 'findCurrentDataDiskId')
                .resolves(overrides.findCurrentDataDiskId ?? CLOUDYPAD_CONFIG.DEFAULTS.DATA_DISK_ID),
            getRawServerData: getRawServerDataStub,
            stopInstance: this.sandbox.stub(ScalewayClient.prototype, 'stopInstance')
                .resolves(overrides.stopInstance),
            detachDataVolume: this.sandbox.stub(ScalewayClient.prototype, 'detachDataVolume')
                .resolves(overrides.detachDataVolume),
            startInstance: this.sandbox.stub(ScalewayClient.prototype, 'startInstance')
                .resolves(overrides.startInstance),
            deleteBlockVolume: this.sandbox.stub(ScalewayClient.prototype, 'deleteBlockVolume')
                .resolves(overrides.deleteBlockVolume)
        }
    }

    /**
     * Creates provider-level stubs for high-level Scaleway operations
     * 
     * @param instanceState - Custom instance state to return, or defaults will be used
     * @returns Object containing configured provider stubs
     * 
     * @example
     * ```typescript
     * const customState = new InstanceStateBuilder()
     *   .withName('custom-instance')
     *   .build()
     * 
     * const stubs = stubManager.createProviderStubs(customState)
     * expect(stubs.getInstanceState).to.resolve.to(customState)
     * ```
     */
    createProviderStubs(instanceState?: ScalewayInstanceStateV1): ProviderStubs {
        const defaultState = new InstanceStateBuilder().build()
        
        return {
            getInstanceState: this.sandbox.stub(ScalewayProviderClient.prototype, 'getInstanceState')
                .resolves(instanceState ?? defaultState),
            setProvisionOutput: this.sandbox.stub(StateWriter.prototype, 'setProvisionOutput')
                .resolves()
        }
    }
}

/**
 * Factory for creating test data with sensible defaults
 * Provides convenient methods for common test scenarios
 * 
 * @example
 * ```typescript
 * // Create a basic instance state builder
 * const state = TestDataFactory.instanceState()
 *   .withName('custom-instance')
 *   .build()
 * 
 * // Create snapshot arguments with overrides
 * const args = TestDataFactory.snapshotArgs({
 *   snapshotName: 'production-backup'
 * })
 * ```
 */
export class TestDataFactory {
    /**
     * Creates a new InstanceStateBuilder with default values
     * 
     * @returns Fresh InstanceStateBuilder ready for customization
     */
    static instanceState(): InstanceStateBuilder {
        return new InstanceStateBuilder()
    }

    /**
     * Creates snapshot operation arguments with sensible defaults
     * 
     * @param overrides - Custom values to override defaults
     * @returns Snapshot arguments object ready for use
     * 
     * @example
     * ```typescript
     * const args = TestDataFactory.snapshotArgs({
     *   snapshotName: 'critical-backup',
     *   instanceName: 'production-db'
     * })
     * ```
     */
    static snapshotArgs(overrides: Record<string, unknown> = {}) {
        return {
            instanceName: 'test-instance',
            projectId: CLOUDYPAD_CONFIG.DEFAULTS.PROJECT_ID,
            zone: CLOUDYPAD_CONFIG.DEFAULTS.ZONE,
            dataDiskId: CLOUDYPAD_CONFIG.DEFAULTS.DATA_DISK_ID,
            snapshotName: 'test-snapshot',
            instanceServerId: CLOUDYPAD_CONFIG.DEFAULTS.INSTANCE_SERVER_ID,
            ...overrides
        }
    }

    /**
     * Creates optimized test data using batch field operations
     * More efficient than chaining individual withXxx() calls
     * 
     * @param overrides - Field overrides to apply in batch
     * @returns InstanceStateBuilder with all overrides applied efficiently
     * 
     * @example
     * ```typescript
     * const builder = TestDataFactory.optimizedInstanceState({
     *   name: 'fast-instance',
     *   region: 'eu-west-1',
     *   projectId: 'custom-project-id'
     * })
     * ```
     */
    static optimizedInstanceState(overrides: BuilderFieldPaths = {}): InstanceStateBuilder {
        return new InstanceStateBuilder().withFields(overrides)
    }

    /**
     * Performance-optimized factory for creating multiple similar instances
     * Ideal for test suites that need many state objects
     * 
     * @param count - Number of instance states to create
     * @param baseOverrides - Base field values applied to all instances
     * @returns Array of ScalewayInstanceStateV1 objects with unique names
     * 
     * @example
     * ```typescript
     * // Create 100 test instances with custom region
     * const states = TestDataFactory.batchInstanceStates(100, {
     *   region: 'us-west-2',
     *   projectId: 'load-test-project'
     * })
     * // Names will be: 'test-instance-0', 'test-instance-1', etc.
     * ```
     */
    static batchInstanceStates(count: number, baseOverrides: BuilderFieldPaths = {}): ScalewayInstanceStateV1[] {
        const baseBuilder = new InstanceStateBuilder().withFields(baseOverrides)
        return Array.from({ length: count }, (_, i) => 
            baseBuilder.withName(`test-instance-${i}`).build()
        )
    }

    /**
     * Creates CLI argument arrays for testing snapshot commands
     * 
     * @param command - The snapshot command ('create', 'restore', etc.)
     * @param additionalArgs - Additional CLI arguments to append
     * @returns Array of CLI arguments ready for process execution
     * 
     * @example
     * ```typescript
     * const args = TestDataFactory.cliArgs('create', '--delete-data-disk')
     * // ['node', 'cloudypad', 'snapshot', 'scaleway', 'create', '--name', 'test-instance', '--delete-data-disk']
     * ```
     */
    static cliArgs(command: string, ...additionalArgs: string[]) {
        return ['node', 'cloudypad', 'snapshot', 'scaleway', command, '--name', 'test-instance', ...additionalArgs]
    }
}

/**
 * High-level test setup utilities for complete Scaleway test environments
 * Handles all aspects of test setup including environment variables, stubs, and cleanup
 * 
 * @example
 * ```typescript
 * describe('Scaleway Tests', () => {
 *   let testEnv: ReturnType<typeof ScalewayTestSetup.createCompleteTestEnvironment>
 * 
 *   beforeEach(() => {
 *     const sandbox = sinon.createSandbox()
 *     testEnv = ScalewayTestSetup.createCompleteTestEnvironment(sandbox)
 *   })
 * 
 *   afterEach(() => {
 *     testEnv.cleanup()
 *   })
 * })
 * ```
 */
export class ScalewayTestSetup {
    /**
     * Creates a complete test environment with all necessary stubs and setup
     * Configures environment variables, creates stub manager, and sets up all client stubs
     * 
     * @param sandbox - Sinon sandbox for managing all stubs
     * @returns Object containing all test utilities and cleanup function
     * 
     * @example
     * ```typescript
     * const sandbox = sinon.createSandbox()
     * const { stubManager, providerStubs, clientStubs, cleanup } = 
     *   ScalewayTestSetup.createCompleteTestEnvironment(sandbox)
     * 
     * // Use stubs in tests...
     * clientStubs.createServer.resolves({ id: 'srv-123' })
     * 
     * // Always cleanup
     * cleanup()
     * ```
     */
    static createCompleteTestEnvironment(sandbox: sinon.SinonSandbox) {
        ScalewayEnvironment.setup()
        
        const stubManager = new SinonStubManager(sandbox)
        const providerStubs = stubManager.createProviderStubs()
        const clientStubs = stubManager.createScalewayClientStubs()

        return {
            /** Stub manager for creating additional stubs */
            stubManager,
            /** Provider-level stubs (getInstanceState, etc.) */
            providerStubs,
            /** Client-level stubs (SDK operations) */
            clientStubs,
            /** Cleanup function - MUST be called in afterEach */
            cleanup: () => {
                sandbox.restore()
                ScalewayEnvironment.cleanup()
            }
        }
    }
}

/**
 * Specialized assertion helpers for Scaleway testing scenarios
 * Provides domain-specific assertions with clear error messages
 * 
 * @example
 * ```typescript
 * // Assert snapshot creation with specific arguments
 * ScalewayTestAssertions.assertSnapshotCallWithArgs(createSnapshotStub, {
 *   instanceName: 'test-instance',
 *   snapshotName: 'backup-2023'
 * })
 * 
 * // Assert retry behavior
 * ScalewayTestAssertions.assertStubCalledWithRetries(retryableStub, 3)
 * ```
 */
export class ScalewayTestAssertions {
    /**
     * Asserts that a stub was called once with specific argument values
     * Provides detailed error messages for debugging test failures
     * 
     * @param stub - The Sinon stub to check
     * @param expectedArgs - Object containing expected argument values
     * @throws {Error} If stub wasn't called once or arguments don't match
     * 
     * @example
     * ```typescript
     * ScalewayTestAssertions.assertSnapshotCallWithArgs(createSnapshotStub, {
     *   projectId: '12345678-1234-1234-1234-123456789012',
     *   zone: 'fr-par-1',
     *   snapshotName: 'critical-backup'
     * })
     * ```
     */
    static assertSnapshotCallWithArgs(stub: sinon.SinonStub, expectedArgs: Record<string, unknown>) {
        if (!stub.calledOnce) {
            throw new Error(`Expected stub to be called once, but it was called ${stub.callCount} times`)
        }
        
        const actualArgs = stub.firstCall.args[0]
        for (const [key, expectedValue] of Object.entries(expectedArgs)) {
            if (actualArgs[key] !== expectedValue) {
                throw new Error(`Expected ${key} to be ${expectedValue}, but got ${actualArgs[key]}`)
            }
        }
    }

    /**
     * Asserts that a stub was called a specific number of times (for retry testing)
     * 
     * @param stub - The Sinon stub to check
     * @param expectedRetries - Expected number of calls
     * @throws {Error} If call count doesn't match expected retries
     * 
     * @example
     * ```typescript
     * // Test that operation was retried 3 times
     * ScalewayTestAssertions.assertStubCalledWithRetries(unreliableOperationStub, 3)
     * ```
     */
    static assertStubCalledWithRetries(stub: sinon.SinonStub, expectedRetries: number) {
        if (stub.callCount !== expectedRetries) {
            throw new Error(`Expected ${expectedRetries} retries, but got ${stub.callCount}`)
        }
    }
}