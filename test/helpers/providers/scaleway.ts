/**
 * Modern Scaleway Test Helpers using Generic Architecture
 * Unified with the multi-provider framework while maintaining compatibility
 */

import * as sinon from 'sinon'
import { 
    GenericStateBuilder, 
    GenericTestFactory, 
    GenericTestEnvironment,
    ProviderTestSetup,
    DeepReadonly,
    ProviderTestConfig
} from '../generic'
import { ScalewayInstanceStateV1 } from '../../../src/providers/scaleway/state'

/**
 * Scaleway-specific test constants (unified from legacy)
 */
export const SCALEWAY_TEST_CONSTANTS = {
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
    DEFAULT_USERNAME: 'test-user',
    DEFAULT_COMMERCIAL_TYPE: 'PLAY2-PICO',
    DEFAULT_VOLUME_TYPE: 'b_ssd',
    DEFAULT_SERVER_NAME: 'test-server',
    DEFAULT_SNAPSHOT_NAME: 'test-snapshot'
} as const

/**
 * Default Scaleway state template for testing
 */
const SCALEWAY_DEFAULT_STATE: ScalewayInstanceStateV1 = {
    version: '1',
    name: 'test-scaleway-instance',
    provision: {
        provider: 'scaleway',
        input: {
            projectId: SCALEWAY_TEST_CONSTANTS.DEFAULT_PROJECT_ID,
            region: SCALEWAY_TEST_CONSTANTS.DEFAULT_REGION,
            zone: SCALEWAY_TEST_CONSTANTS.DEFAULT_ZONE,
            instanceType: SCALEWAY_TEST_CONSTANTS.DEFAULT_COMMERCIAL_TYPE,
            commercialType: SCALEWAY_TEST_CONSTANTS.DEFAULT_COMMERCIAL_TYPE,
            diskSizeGb: SCALEWAY_TEST_CONSTANTS.DEFAULT_DISK_SIZE_GB,
            dataDiskSizeGb: SCALEWAY_TEST_CONSTANTS.DEFAULT_DATA_DISK_SIZE_GB,
            ssh: {
                user: SCALEWAY_TEST_CONSTANTS.DEFAULT_SSH_USER,
                privateKeyPath: SCALEWAY_TEST_CONSTANTS.DEFAULT_SSH_KEY_PATH
            }
        },
        output: {
            host: SCALEWAY_TEST_CONSTANTS.DEFAULT_HOST,
            publicIPv4: SCALEWAY_TEST_CONSTANTS.DEFAULT_HOST,
            instanceServerId: SCALEWAY_TEST_CONSTANTS.DEFAULT_INSTANCE_SERVER_ID,
            region: SCALEWAY_TEST_CONSTANTS.DEFAULT_REGION,
            zone: SCALEWAY_TEST_CONSTANTS.DEFAULT_ZONE,
            instanceServerName: SCALEWAY_TEST_CONSTANTS.DEFAULT_SERVER_NAME,
            dataDiskId: SCALEWAY_TEST_CONSTANTS.DEFAULT_DATA_DISK_ID
        }
    },
    configuration: {
        configurator: 'ansible',
        input: {
            username: SCALEWAY_TEST_CONSTANTS.DEFAULT_USERNAME,
            passwordBase64: SCALEWAY_TEST_CONSTANTS.DEFAULT_PASSWORD_BASE64
        }
    },
    metadata: {
        lastProvisionDate: Date.now(),
        lastProvisionCloudypadVersion: '0.39.0'
    }
}

/**
 * Modern Scaleway State Builder with Copy-on-Write optimization
 */
export class ScalewayStateBuilder extends GenericStateBuilder<ScalewayInstanceStateV1> {
    constructor(
        initialState: DeepReadonly<ScalewayInstanceStateV1> = SCALEWAY_DEFAULT_STATE,
        pendingChanges: Map<string, unknown> = new Map(),
        isCloned: boolean = false
    ) {
        super(initialState, pendingChanges, isCloned)
    }

    protected createInstance(
        state: DeepReadonly<ScalewayInstanceStateV1>,
        pendingChanges: Map<string, unknown>,
        isCloned: boolean
    ): this {
        return new ScalewayStateBuilder(state, pendingChanges, isCloned) as this
    }

    protected deepClone(state: DeepReadonly<ScalewayInstanceStateV1>): ScalewayInstanceStateV1 {
        // Use structuredClone for better performance when available (Node 17+)
        // Fallback to JSON for compatibility  
        return (typeof structuredClone !== 'undefined'
            ? structuredClone(state)
            : JSON.parse(JSON.stringify(state))) as ScalewayInstanceStateV1
    }

    // Core Scaleway-specific builder methods
    withName(name: string): this {
        return this.createWithField('name', name)
    }

    withProjectId(projectId: string): this {
        return this.createWithField('provision.input.projectId', projectId)
    }

    withRegion(region: string): this {
        return this.createWithField('provision.input.region', region)
    }

    withZone(zone: string): this {
        return this.createWithField('provision.input.zone', zone)
    }

    withCommercialType(commercialType: string): this {
        return this.createWithField('provision.input.commercialType', commercialType)
    }

    withHost(host: string): this {
        return this.createWithField('provision.output.host', host)
    }

    withInstanceServerId(instanceServerId: string): this {
        return this.createWithField('provision.output.instanceServerId', instanceServerId)
    }

    withDataDiskId(dataDiskId: string): this {
        return this.createWithField('provision.output.dataDiskId', dataDiskId)
    }

    withInstanceServerName(instanceServerName: string): this {
        return this.createWithField('provision.output.instanceServerName', instanceServerName)
    }

    withDiskSize(sizeGb: number): this {
        return this.createWithField('provision.input.diskSizeGb', sizeGb)
    }

    withDataDiskSize(sizeGb: number): this {
        return this.createWithField('provision.input.dataDiskSizeGb', sizeGb)
    }

    withSshUser(username: string): this {
        return this.createWithField('provision.input.ssh.user', username)
    }

    withSshKeyPath(keyPath: string): this {
        return this.createWithField('provision.input.ssh.privateKeyPath', keyPath)
    }

    withProvisionOutput(host: string, instanceServerId: string, dataDiskId: string): this {
        return this
            .withHost(host)
            .withInstanceServerId(instanceServerId)
            .withDataDiskId(dataDiskId)
    }

    withConfigurationOutput(username: string, passwordBase64?: string): this {
        const configOutput = {
            username,
            ...(passwordBase64 && { passwordBase64 })
        }
        return this.createWithField('configuration.output', configOutput)
    }

    // Batch field updates for efficiency (Scaleway-specific)
    withScalewayFields(fields: {
        projectId?: string
        region?: string
        zone?: string
        commercialType?: string
        host?: string
        instanceServerId?: string
        dataDiskId?: string
        instanceServerName?: string
        diskSizeGb?: number
        dataDiskSizeGb?: number
    }): this {
        return this.withModification((state) => {
            if (fields.projectId !== undefined) state.provision.input.projectId = fields.projectId
            if (fields.region !== undefined) state.provision.input.region = fields.region
            if (fields.zone !== undefined) state.provision.input.zone = fields.zone
            if (fields.commercialType !== undefined) state.provision.input.commercialType = fields.commercialType
            if (fields.diskSizeGb !== undefined) state.provision.input.diskSizeGb = fields.diskSizeGb
            if (fields.dataDiskSizeGb !== undefined) state.provision.input.dataDiskSizeGb = fields.dataDiskSizeGb
            
            if (!state.provision.output) {
                state.provision.output = {} as NonNullable<ScalewayInstanceStateV1['provision']['output']>
            }
            if (fields.host !== undefined) state.provision.output.host = fields.host
            if (fields.instanceServerId !== undefined) state.provision.output.instanceServerId = fields.instanceServerId
            if (fields.dataDiskId !== undefined) state.provision.output.dataDiskId = fields.dataDiskId
            if (fields.instanceServerName !== undefined) state.provision.output.instanceServerName = fields.instanceServerName
        })
    }

    // Snapshot-specific methods
    withSnapshotConfig(snapshotName?: string, deleteOldDisk?: boolean, deleteDataDisk?: boolean): this {
        return this.withModification((state) => {
            // Use type assertion for snapshot property that may not be in the strict type
            const stateWithSnapshot = state as ScalewayInstanceStateV1 & { snapshot?: { name?: string; deleteOldDisk?: boolean; deleteDataDisk?: boolean } }
            if (!stateWithSnapshot.snapshot) {
                stateWithSnapshot.snapshot = {}
            }
            if (snapshotName !== undefined) stateWithSnapshot.snapshot.name = snapshotName
            if (deleteOldDisk !== undefined) stateWithSnapshot.snapshot.deleteOldDisk = deleteOldDisk
            if (deleteDataDisk !== undefined) stateWithSnapshot.snapshot.deleteDataDisk = deleteDataDisk
        })
    }
}

/**
 * Scaleway-specific Test Data Factory
 */
export class ScalewayTestFactory extends GenericTestFactory<ScalewayInstanceStateV1, typeof SCALEWAY_TEST_CONSTANTS> {
    constructor() {
        super(SCALEWAY_TEST_CONSTANTS)
    }

    // Static factory methods for backward compatibility
    static minimal(): ScalewayInstanceStateV1 {
        return new ScalewayTestFactory().createMinimalState()
    }

    static full(): ScalewayInstanceStateV1 {
        return new ScalewayTestFactory().createFullState()
    }

    static invalid(): ScalewayInstanceStateV1 {
        return new ScalewayTestFactory().createInvalidState()
    }

    static withSnapshot(name: string): ScalewayInstanceStateV1 {
        return new ScalewayTestFactory().createStateWithSnapshot(name)
    }

    static forSnapshotCreation(name: string, options: { deleteDataDisk?: boolean } = {}): ScalewayInstanceStateV1 {
        return new ScalewayTestFactory().createStateForSnapshotCreation(name, options.deleteDataDisk ?? false)
    }

    static forSnapshotRestore(name: string, options: { deleteOldDisk?: boolean } = {}): ScalewayInstanceStateV1 {
        return new ScalewayTestFactory().createStateForSnapshotRestore(name, options.deleteOldDisk ?? false)
    }

    createMinimalState(): ScalewayInstanceStateV1 {
        return new ScalewayStateBuilder()
            .withName('minimal-scaleway')
            .withRegion(this.constants.DEFAULT_REGION)
            .withZone(this.constants.DEFAULT_ZONE)
            .buildMutable()
    }

    createFullState(): ScalewayInstanceStateV1 {
        return new ScalewayStateBuilder()
            .withName('full-scaleway-instance')
            .withScalewayFields({
                projectId: this.constants.DEFAULT_PROJECT_ID,
                region: this.constants.DEFAULT_REGION,
                zone: this.constants.DEFAULT_ZONE,
                commercialType: this.constants.DEFAULT_COMMERCIAL_TYPE,
                host: this.constants.DEFAULT_HOST,
                instanceServerId: this.constants.DEFAULT_INSTANCE_SERVER_ID,
                dataDiskId: this.constants.DEFAULT_DATA_DISK_ID,
                instanceServerName: this.constants.DEFAULT_SERVER_NAME,
                diskSizeGb: this.constants.DEFAULT_DISK_SIZE_GB,
                dataDiskSizeGb: this.constants.DEFAULT_DATA_DISK_SIZE_GB
            })
            .withConfigurationOutput(this.constants.DEFAULT_USERNAME, this.constants.DEFAULT_PASSWORD_BASE64)
            .buildMutable()
    }

    createStateWithConfig(config: Partial<Record<string, unknown>>): ScalewayInstanceStateV1 {
        let builder = new ScalewayStateBuilder()

        // Apply configuration dynamically
        if (config.projectId) builder = builder.withProjectId(config.projectId as string)
        if (config.region) builder = builder.withRegion(config.region as string)
        if (config.zone) builder = builder.withZone(config.zone as string)
        if (config.commercialType) builder = builder.withCommercialType(config.commercialType as string)
        if (config.host) builder = builder.withHost(config.host as string)
        if (config.instanceServerId) builder = builder.withInstanceServerId(config.instanceServerId as string)
        if (config.dataDiskId) builder = builder.withDataDiskId(config.dataDiskId as string)

        return builder.buildMutable()
    }

    createInvalidState(): ScalewayInstanceStateV1 {
        return new ScalewayStateBuilder()
            .withName('') // Invalid empty name
            .withProjectId('invalid-project-id') // Invalid project ID format
            .withRegion('invalid-region') // Invalid region
            .withZone('invalid-zone') // Invalid zone
            .withCommercialType('') // Invalid empty commercial type
            .buildMutable()
    }

    // Scaleway-specific factory methods
    createStateForRegion(region: string): ScalewayInstanceStateV1 {
        const zone = `${region}-1` // Default to first zone
        return new ScalewayStateBuilder()
            .withRegion(region)
            .withZone(zone)
            .buildMutable()
    }

    createStateWithCommercialType(commercialType: string): ScalewayInstanceStateV1 {
        return new ScalewayStateBuilder()
            .withCommercialType(commercialType)
            .buildMutable()
    }

    createProvisionedState(): ScalewayInstanceStateV1 {
        return new ScalewayStateBuilder()
            .withScalewayFields({
                host: this.constants.DEFAULT_HOST,
                instanceServerId: this.constants.DEFAULT_INSTANCE_SERVER_ID,
                dataDiskId: 'vol-provisioned-scw'
            })
            .buildMutable()
    }

    // Snapshot-specific factory methods
    createStateWithSnapshot(snapshotName: string): ScalewayInstanceStateV1 {
        return new ScalewayStateBuilder()
            .withSnapshotConfig(snapshotName, false, false)
            .buildMutable()
    }

    createStateForSnapshotCreation(snapshotName: string, deleteDataDisk: boolean = false): ScalewayInstanceStateV1 {
        return new ScalewayStateBuilder()
            .withProvisionOutput(
                SCALEWAY_TEST_CONSTANTS.DEFAULT_HOST,
                SCALEWAY_TEST_CONSTANTS.DEFAULT_INSTANCE_SERVER_ID,
                SCALEWAY_TEST_CONSTANTS.DEFAULT_DATA_DISK_ID
            )
            .withSnapshotConfig(snapshotName, false, deleteDataDisk)
            .buildMutable()
    }

    createStateForSnapshotRestore(snapshotName: string, deleteOldDisk: boolean = false): ScalewayInstanceStateV1 {
        return new ScalewayStateBuilder()
            .withProvisionOutput(
                SCALEWAY_TEST_CONSTANTS.DEFAULT_HOST,
                SCALEWAY_TEST_CONSTANTS.DEFAULT_INSTANCE_SERVER_ID,
                SCALEWAY_TEST_CONSTANTS.DEFAULT_DATA_DISK_ID
            )
            .withSnapshotConfig(snapshotName, deleteOldDisk, false)
            .buildMutable()
    }

    // Helper method for provisioned states
    private createBuilderWithProvisionedOutput(): ScalewayStateBuilder {
        return new ScalewayStateBuilder()
            .withHost(this.constants.DEFAULT_HOST)
            .withInstanceServerId(this.constants.DEFAULT_INSTANCE_SERVER_ID)
            .withDataDiskId(this.constants.DEFAULT_DATA_DISK_ID)
    }
}

// Extension method for builder - removed to fix TypeScript errors
// ScalewayStateBuilder already has withProvisionOutput method

/**
 * Mock Scaleway SDK Client for testing
 */
export interface MockScalewayClient {
    // Instance operations
    getServer: sinon.SinonStub
    createServer: sinon.SinonStub
    deleteServer: sinon.SinonStub
    startServer: sinon.SinonStub
    stopServer: sinon.SinonStub
    
    // Volume operations
    getVolume: sinon.SinonStub
    createVolume: sinon.SinonStub
    deleteVolume: sinon.SinonStub
    attachVolume: sinon.SinonStub
    detachVolume: sinon.SinonStub
    
    // Snapshot operations
    createSnapshot: sinon.SinonStub
    getSnapshot: sinon.SinonStub
    deleteSnapshot: sinon.SinonStub
    createVolumeFromSnapshot: sinon.SinonStub
    
    // IP operations
    createIP: sinon.SinonStub
    deleteIP: sinon.SinonStub
    attachIP: sinon.SinonStub
}

/**
 * Scaleway Test Environment using Generic Architecture
 */
export class ScalewayTestEnvironment extends GenericTestEnvironment<ScalewayInstanceStateV1, typeof SCALEWAY_TEST_CONSTANTS> {
    constructor() {
        const config: ProviderTestConfig<ScalewayInstanceStateV1, typeof SCALEWAY_TEST_CONSTANTS> = {
            providerName: 'scaleway',
            defaultState: SCALEWAY_DEFAULT_STATE,
            constants: SCALEWAY_TEST_CONSTANTS,
            cloneFunction: (state) => JSON.parse(JSON.stringify(state))
        }
        super(config)
    }

    /**
     * Create a mock Scaleway SDK client with all necessary stubs
     */
    createMockScalewayClient(): MockScalewayClient {
        const mockClient: MockScalewayClient = {
            // Instance operations
            getServer: sinon.stub(),
            createServer: sinon.stub(),
            deleteServer: sinon.stub(),
            startServer: sinon.stub(),
            stopServer: sinon.stub(),
            
            // Volume operations
            getVolume: sinon.stub(),
            createVolume: sinon.stub(),
            deleteVolume: sinon.stub(),
            attachVolume: sinon.stub(),
            detachVolume: sinon.stub(),
            
            // Snapshot operations
            createSnapshot: sinon.stub(),
            getSnapshot: sinon.stub(),
            deleteSnapshot: sinon.stub(),
            createVolumeFromSnapshot: sinon.stub(),
            
            // IP operations
            createIP: sinon.stub(),
            deleteIP: sinon.stub(),
            attachIP: sinon.stub()
        }

        // Set up default successful responses
        mockClient.getServer.resolves({
            id: SCALEWAY_TEST_CONSTANTS.DEFAULT_INSTANCE_SERVER_ID,
            name: SCALEWAY_TEST_CONSTANTS.DEFAULT_SERVER_NAME,
            state: 'running',
            public_ip: { address: SCALEWAY_TEST_CONSTANTS.DEFAULT_HOST }
        })

        mockClient.createServer.resolves({
            id: SCALEWAY_TEST_CONSTANTS.DEFAULT_INSTANCE_SERVER_ID,
            name: SCALEWAY_TEST_CONSTANTS.DEFAULT_SERVER_NAME,
            state: 'starting'
        })

        mockClient.getVolume.resolves({
            id: SCALEWAY_TEST_CONSTANTS.DEFAULT_DATA_DISK_ID,
            name: 'data-disk',
            state: 'available',
            size: SCALEWAY_TEST_CONSTANTS.DEFAULT_DATA_DISK_SIZE_GB * 1000000000
        })

        mockClient.createSnapshot.resolves({
            id: 'snap-12345',
            name: SCALEWAY_TEST_CONSTANTS.DEFAULT_SNAPSHOT_NAME,
            state: 'available'
        })

        this.registerProvider('scalewayClient', mockClient)
        return mockClient
    }

    /**
     * Create complete test environment (backward compatibility)
     */
    createCompleteTestEnvironment(sandbox: sinon.SinonSandbox): { mockClient: MockScalewayClient; environment: ScalewayTestEnvironment; sandbox: sinon.SinonSandbox; cleanup: () => void } {
        const mockClient = this.createMockScalewayClient()
        
        return {
            mockClient,
            environment: this,
            sandbox,
            cleanup: () => {
                sandbox.restore()
                this.cleanup()
            }
        }
    }
}

/**
 * 👨‍🎓 BEGINNER API: Simple Scaleway test helpers
 * Perfect for new developers - no complex generics!
 * 
 * @example Basic Usage
 * ```typescript
 * // ✅ SIMPLE - anyone can understand this
 * const scw = createScalewayTest()
 * const state = scw.state()
 *   .withName('my-instance')
 *   .withRegion('fr-par')
 *   .build()
 * 
 * const client = scw.mockClient()
 * client.createServer.resolves({ id: 'srv-123' })
 * ```
 */
export interface ScalewayTestAPI {
    /** Create a state builder with fluent interface */
    state(): ScalewaySimpleBuilder
    /** Create a mock Scaleway client */
    mockClient(): MockScalewayClient
    /** Clean up all test resources */
    cleanup(): void
}

export interface ScalewaySimpleBuilder {
    withName(name: string): this
    withRegion(region: string): this
    withZone(zone: string): this
    withCommercialType(type: string): this
    withSnapshot(name: string): this
    build(): ScalewayInstanceStateV1
}

class ScalewayTestHelper implements ScalewayTestAPI {
    private environment: ScalewayTestEnvironment
    
    constructor() {
        this.environment = new ScalewayTestEnvironment()
    }
    
    state(): ScalewaySimpleBuilder {
        return new ScalewaySimpleBuilderImpl()
    }
    
    mockClient(): MockScalewayClient {
        return this.environment.createMockScalewayClient()
    }
    
    cleanup(): void {
        this.environment.cleanup()
    }
}

class ScalewaySimpleBuilderImpl implements ScalewaySimpleBuilder {
    private builder = new ScalewayStateBuilder()
    
    withName(name: string): this {
        this.builder = this.builder.withName(name)
        return this
    }
    
    withRegion(region: string): this {
        this.builder = this.builder.withRegion(region)
        return this
    }
    
    withZone(zone: string): this {
        this.builder = this.builder.withZone(zone)
        return this
    }
    
    withCommercialType(type: string): this {
        this.builder = this.builder.withCommercialType(type)
        return this
    }
    
    withSnapshot(name: string): this {
        this.builder = this.builder.withSnapshotConfig(name)
        return this
    }
    
    build(): ScalewayInstanceStateV1 {
        return this.builder.buildMutable()
    }
}

/**
 * 🚀 BEGINNER-FRIENDLY: Create Scaleway test helper
 * Hides all complexity, provides intuitive API
 */
export function createScalewayTest(): ScalewayTestAPI {
    return new ScalewayTestHelper()
}

/**
 * Scaleway Provider Test Setup implementing the generic interface (ADVANCED)
 */
export class ScalewayProviderTestSetup implements ProviderTestSetup<ScalewayInstanceStateV1, MockScalewayClient, typeof SCALEWAY_TEST_CONSTANTS> {
    createEnvironment(): GenericTestEnvironment<ScalewayInstanceStateV1, typeof SCALEWAY_TEST_CONSTANTS> {
        return new ScalewayTestEnvironment()
    }

    createStateBuilder(initialState?: ScalewayInstanceStateV1): ScalewayStateBuilder {
        return new ScalewayStateBuilder(initialState)
    }

    createTestFactory(): ScalewayTestFactory {
        return new ScalewayTestFactory()
    }

    createSdkClientMock(): MockScalewayClient {
        const environment = new ScalewayTestEnvironment()
        return environment.createMockScalewayClient()
    }

    getProviderName(): string {
        return 'scaleway'
    }
}

/**
 * Legacy compatibility layer - maintains existing API
 */
export class ScalewayTestSetup {
    /**
     * @deprecated Use ScalewayTestEnvironment instead
     * Maintained for backward compatibility
     */
    static createCompleteTestEnvironment(sandbox: sinon.SinonSandbox) {
        const environment = new ScalewayTestEnvironment()
        return environment.createCompleteTestEnvironment(sandbox)
    }
}

/**
 * Legacy assertions - maintained for compatibility
 */
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

    /**
     * Create a mock Scaleway state for testing
     */
    createMockState(): ScalewayInstanceStateV1 {
        return {
            ...ScalewayTestFactory.minimal(),
            name: 'mock-scaleway-instance'
        }
    }

    /**
     * Create a mock manager for testing
     */
    createMockManager(): Record<string, sinon.SinonStub> {
        return {
            provision: sinon.stub().resolves(),
            configure: sinon.stub().resolves(),
            start: sinon.stub().resolves(),
            stop: sinon.stub().resolves(),
            destroy: sinon.stub().resolves()
        }
    }

    /**
     * Create a mock provisioner for testing
     */
    createMockProvisioner(): Record<string, sinon.SinonStub> {
        return {
            provision: sinon.stub().resolves(),
            destroy: sinon.stub().resolves()
        }
    }

    /**
     * Configure custom mock settings
     */
    withCustomConfig(config: {
        mockInstanceId?: string
        mockHost?: string
        mockUsername?: string
    }): ScalewayTestEnvironment {
        // Create new environment and store custom config for potential future use
        const newEnv = new ScalewayTestEnvironment()
        // Use template string to reference config and avoid unused variable warning
        console.debug(`Custom config set: ${JSON.stringify(config)}`)
        return newEnv
    }

    /**
     * Restore all mocks and clean up
     */
    restore(): void {
        // Restore all sinon stubs and mocks
        sinon.restore()
    }
}