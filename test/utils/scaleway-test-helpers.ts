import * as sinon from 'sinon'
import { ScalewayClient } from '../../src/providers/scaleway/sdk-client'
import { StateWriter } from '../../src/core/state/writer'
import { ScalewayProviderClient } from '../../src/providers/scaleway/provider'
import { ScalewayInstanceStateV1 } from '../../src/providers/scaleway/state'

// Test constants centralized to avoid duplication
const TEST_CONSTANTS = {
    DEFAULT_PROJECT_ID: '12345678-1234-1234-1234-123456789012',
    DEFAULT_REGION: 'fr-par',
    DEFAULT_ZONE: 'fr-par-1',
    DEFAULT_HOST: '1.2.3.4',
    DEFAULT_DATA_DISK_ID: '12345678-1234-1234-1234-123456789abc',
    DEFAULT_INSTANCE_SERVER_ID: 'srv-1',
    DEFAULT_SSH_USER: 'ubuntu',
    DEFAULT_SSH_KEY_PATH: './test/resources/ssh-key',
    DEFAULT_DISK_SIZE_GB: 20,
    DEFAULT_DATA_DISK_SIZE_GB: 100,
    DEFAULT_PASSWORD_BASE64: 'dGVzdC1wYXNzd29yZA==',
    DEFAULT_USERNAME: 'test-user'
} as const

// Utility types for deep readonly and immutability
type DeepReadonly<T> = {
    readonly [P in keyof T]: T[P] extends object ? DeepReadonly<T[P]> : T[P]
}

// Type for builder modification functions - ensures type safety
type BuilderModification<T> = (state: T) => void

// Branded type to distinguish immutable instances
type ImmutableState<T> = DeepReadonly<T> & { readonly __immutable: true }

// Advanced types for better withFields type safety
type BuilderFieldPaths = {
    name?: string
    projectId?: string
    region?: string
    zone?: string
    instanceServerId?: string
    dataDiskId?: string
    host?: string
    diskSizeGb?: number
    dataDiskSizeGb?: number
    username?: string
}

// Type guard utilities
type ProvisionOutput = NonNullable<ScalewayInstanceStateV1['provision']['output']>

// Default instance state - immutable reference using centralized constants
const DEFAULT_INSTANCE_STATE: DeepReadonly<ScalewayInstanceStateV1> = {
    version: '1' as const,
    name: 'test-instance',
    provision: {
        provider: 'scaleway' as const,
        input: {
            projectId: TEST_CONSTANTS.DEFAULT_PROJECT_ID,
            region: TEST_CONSTANTS.DEFAULT_REGION,
            zone: TEST_CONSTANTS.DEFAULT_ZONE,
            ssh: { 
                user: TEST_CONSTANTS.DEFAULT_SSH_USER, 
                privateKeyPath: TEST_CONSTANTS.DEFAULT_SSH_KEY_PATH 
            },
            instanceType: 'GPU',
            diskSizeGb: TEST_CONSTANTS.DEFAULT_DISK_SIZE_GB,
            dataDiskSizeGb: TEST_CONSTANTS.DEFAULT_DATA_DISK_SIZE_GB
        },
        output: {
            host: TEST_CONSTANTS.DEFAULT_HOST,
            publicIPv4: TEST_CONSTANTS.DEFAULT_HOST,
            dataDiskId: TEST_CONSTANTS.DEFAULT_DATA_DISK_ID,
            instanceServerId: TEST_CONSTANTS.DEFAULT_INSTANCE_SERVER_ID
        }
    },
    configuration: {
        configurator: 'ansible' as const,
        input: {
            sunshine: {
                enable: true,
                passwordBase64: TEST_CONSTANTS.DEFAULT_PASSWORD_BASE64,
                username: TEST_CONSTANTS.DEFAULT_USERNAME
            }
        }
    }
} as const

/**
 * Immutable builder pattern for creating ScalewayInstanceStateV1 objects with sensible defaults
 * for testing purposes. Each operation returns a new builder instance, preventing mutations.
 * 
 * Features:
 * - Type-safe immutability with DeepReadonly
 * - Copy-on-Write optimization for performance
 * - Type guards for null-safe operations
 * - Batch operations for performance
 * - Fluent API for easy test data creation
 * 
 * Performance: O(1) for single changes, O(n) only when actually building
 */
export class InstanceStateBuilder {
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
        const keys = path.split('.')
        let current = obj as Record<string, unknown>
        
        for (let i = 0; i < keys.length - 1; i++) {
            const key = keys[i]
            if (!(key in current) || typeof current[key] !== 'object' || current[key] === null) {
                current[key] = {}
            }
            current = current[key] as Record<string, unknown>
        }
        
        current[keys[keys.length - 1]] = value
    }

    /**
     * Create a new builder with copy-on-write optimization
     */
    private copyOnWrite(path: string, value: unknown): InstanceStateBuilder {
        const newChanges = new Map(this.pendingChanges)
        newChanges.set(path, value)
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
     * Sets the instance name - Copy-on-Write optimized
     */
    withName(name: string): InstanceStateBuilder {
        return this.copyOnWrite('name', name)
    }

    /**
     * Sets the project ID in provision input - Copy-on-Write optimized
     */
    withProjectId(projectId: string): InstanceStateBuilder {
        return this.copyOnWrite('provision.input.projectId', projectId)
    }

    /**
     * Sets the instance server ID in provision output - Type-safe
     */
    withInstanceServerId(serverId: string): InstanceStateBuilder {
        return this.copyOnWrite('provision.output.instanceServerId', serverId)
    }

    /**
     * Sets the data disk ID in provision output - Type-safe
     */
    withDataDiskId(diskId: string): InstanceStateBuilder {
        return this.copyOnWrite('provision.output.dataDiskId', diskId)
    }

    /**
     * Sets the zone in provision input - Copy-on-Write optimized
     */
    withZone(zone: string): InstanceStateBuilder {
        return this.copyOnWrite('provision.input.zone', zone)
    }

    /**
     * Sets the region in provision input - Copy-on-Write optimized
     */
    withRegion(region: string): InstanceStateBuilder {
        return this.copyOnWrite('provision.input.region', region)
    }

    /**
     * Sets both host and publicIPv4 - Batch operation
     */
    withHost(host: string): InstanceStateBuilder {
        const newChanges = new Map(this.pendingChanges)
        newChanges.set('provision.output.host', host)
        newChanges.set('provision.output.publicIPv4', host)
        return new InstanceStateBuilder(this.state, newChanges, false)
    }

    /**
     * Returns a readonly view of the current state for inspection
     */
    peek(): DeepReadonly<ScalewayInstanceStateV1> {
        return this.state
    }

    /**
     * Builds and returns the instance state (mutable copy for normal use)
     * Copy-on-Write: Only clones when there are actual changes
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
     * Deep freeze an object recursively
     */
    private deepFreeze<T>(obj: T): T {
        Object.getOwnPropertyNames(obj).forEach(prop => {
            const value = (obj as Record<string, unknown>)[prop]
            if (value && typeof value === 'object') {
                this.deepFreeze(value)
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
     * Usage: builder.withFields({ name: 'new-name', projectId: 'new-id' })
     */
    withFields(fields: BuilderFieldPaths): InstanceStateBuilder {
        const newChanges = new Map(this.pendingChanges)
        
        // Map fields to their dot-notation paths
        const fieldMappings: Record<keyof BuilderFieldPaths, string> = {
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
        }
        
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
     * Validates immutability by ensuring the builder instance is unchanged after operations
     * Uses robust deep equality instead of JSON.stringify
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
     * Performance testing method - measures Copy-on-Write efficiency
     */
    static benchmarkPerformance(): { copyOnWrite: number; traditional: number } {
        const iterations = 1000
        
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

// Environment management utilities
export class ScalewayEnvironment {
    static setup(): void {
        process.env.SCW_ACCESS_KEY = 'test-access-key'
        process.env.SCW_SECRET_KEY = 'test-secret-key'
        process.env.SCW_DEFAULT_PROJECT_ID = TEST_CONSTANTS.DEFAULT_PROJECT_ID
        process.env.SCW_DEFAULT_ZONE = TEST_CONSTANTS.DEFAULT_ZONE
    }

    static cleanup(): void {
        delete process.env.SCW_ACCESS_KEY
        delete process.env.SCW_SECRET_KEY
        delete process.env.SCW_DEFAULT_PROJECT_ID
        delete process.env.SCW_DEFAULT_ZONE
    }
}

// Comprehensive stub management
export interface ScalewayClientStubs {
    findCurrentDataDiskId: sinon.SinonStub
    getRawServerData: sinon.SinonStub
    stopInstance: sinon.SinonStub
    detachDataVolume: sinon.SinonStub
    startInstance: sinon.SinonStub
    deleteBlockVolume: sinon.SinonStub
}

export interface ProviderStubs {
    getInstanceState: sinon.SinonStub
    setProvisionOutput: sinon.SinonStub
}

// Type-safe overrides for stub configuration
export interface ScalewayClientStubOverrides {
    findCurrentDataDiskId?: string
    getRawServerData?: unknown // Flexible type for test data
    stopInstance?: void
    detachDataVolume?: void
    startInstance?: void
    deleteBlockVolume?: void
}

export class SinonStubManager {
    private sandbox: sinon.SinonSandbox

    constructor(sandbox: sinon.SinonSandbox) {
        this.sandbox = sandbox
    }

    createScalewayClientStubs(overrides: ScalewayClientStubOverrides = {}): ScalewayClientStubs {
        const getRawServerDataStub = this.sandbox.stub(ScalewayClient.prototype, 'getRawServerData')
        if (overrides.getRawServerData !== undefined) {
            // Force type assertion for test flexibility - we control what we pass in tests
            getRawServerDataStub.resolves(overrides.getRawServerData as Parameters<typeof getRawServerDataStub.resolves>[0])
        } else {
            getRawServerDataStub.resolves(undefined)
        }

        return {
            findCurrentDataDiskId: this.sandbox.stub(ScalewayClient.prototype, 'findCurrentDataDiskId')
                .resolves(overrides.findCurrentDataDiskId ?? TEST_CONSTANTS.DEFAULT_DATA_DISK_ID),
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

// Test data factory with sensible defaults using centralized constants
export class TestDataFactory {
    static instanceState(): InstanceStateBuilder {
        return new InstanceStateBuilder()
    }

    static snapshotArgs(overrides: Record<string, unknown> = {}) {
        return {
            instanceName: 'test-instance',
            projectId: TEST_CONSTANTS.DEFAULT_PROJECT_ID,
            zone: TEST_CONSTANTS.DEFAULT_ZONE,
            dataDiskId: TEST_CONSTANTS.DEFAULT_DATA_DISK_ID,
            snapshotName: 'test-snapshot',
            instanceServerId: TEST_CONSTANTS.DEFAULT_INSTANCE_SERVER_ID,
            ...overrides
        }
    }

    /**
     * Create optimized test data with batch operations
     */
    static optimizedInstanceState(overrides: BuilderFieldPaths = {}): InstanceStateBuilder {
        return new InstanceStateBuilder().withFields(overrides)
    }

    /**
     * Performance-optimized factory for test suites
     */
    static batchInstanceStates(count: number, baseOverrides: BuilderFieldPaths = {}): ScalewayInstanceStateV1[] {
        const baseBuilder = new InstanceStateBuilder().withFields(baseOverrides)
        return Array.from({ length: count }, (_, i) => 
            baseBuilder.withName(`test-instance-${i}`).build()
        )
    }

    static cliArgs(command: string, ...additionalArgs: string[]) {
        return ['node', 'cloudypad', 'snapshot', 'scaleway', command, '--name', 'test-instance', ...additionalArgs]
    }
}

// High-level test setup utilities
export class ScalewayTestSetup {
    static createCompleteTestEnvironment(sandbox: sinon.SinonSandbox) {
        ScalewayEnvironment.setup()
        
        const stubManager = new SinonStubManager(sandbox)
        const providerStubs = stubManager.createProviderStubs()
        const clientStubs = stubManager.createScalewayClientStubs()

        return {
            stubManager,
            providerStubs,
            clientStubs,
            cleanup: () => {
                sandbox.restore()
                ScalewayEnvironment.cleanup()
            }
        }
    }
}

// Test assertion helpers
export class ScalewayTestAssertions {
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

    static assertStubCalledWithRetries(stub: sinon.SinonStub, expectedRetries: number) {
        if (stub.callCount !== expectedRetries) {
            throw new Error(`Expected ${expectedRetries} retries, but got ${stub.callCount}`)
        }
    }
}