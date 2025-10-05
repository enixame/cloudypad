/**
 * AWS-specific Test Helpers using the Generic Architecture
 * Demonstrates extension of generic test helpers for AWS provider
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
import { AwsInstanceStateV1 } from '../../../src/providers/aws/state'

/**
 * AWS-specific test constants
 */
export const AWS_TEST_CONSTANTS = {
    DEFAULT_REGION: 'us-east-1',
    DEFAULT_ZONE: 'us-east-1a',
    DEFAULT_AMI_ID: 'ami-0abcdef1234567890',
    DEFAULT_INSTANCE_TYPE: 't3.medium',
    DEFAULT_KEY_PAIR: 'cloudypad-keypair',
    DEFAULT_SECURITY_GROUP: 'sg-0123456789abcdef0',
    DEFAULT_SUBNET_ID: 'subnet-0123456789abcdef0',
    DEFAULT_VPC_ID: 'vpc-0123456789abcdef0',
    DEFAULT_INSTANCE_ID: 'i-0123456789abcdef0',
    DEFAULT_HOST: '1.2.3.4',
    DEFAULT_SSH_USER: 'ubuntu',
    DEFAULT_SSH_KEY_PATH: './test/resources/ssh-key',
    DEFAULT_DISK_SIZE_GB: 20,
    DEFAULT_DATA_DISK_SIZE_GB: 100,
    DEFAULT_USERNAME: 'test-user',
    DEFAULT_PASSWORD_BASE64: 'dGVzdC1wYXNzd29yZA==',
} as const

/**
 * AWS default state template for testing
 */
const AWS_DEFAULT_STATE: AwsInstanceStateV1 = {
    version: '1',
    name: 'test-aws-instance',
    provision: {
        provider: 'aws',
        input: {
            region: AWS_TEST_CONSTANTS.DEFAULT_REGION,
            zone: AWS_TEST_CONSTANTS.DEFAULT_ZONE,
            instanceType: AWS_TEST_CONSTANTS.DEFAULT_INSTANCE_TYPE,
            amiId: AWS_TEST_CONSTANTS.DEFAULT_AMI_ID,
            keyPair: AWS_TEST_CONSTANTS.DEFAULT_KEY_PAIR,
            diskSize: AWS_TEST_CONSTANTS.DEFAULT_DISK_SIZE_GB,
            dataDiskSizeGb: AWS_TEST_CONSTANTS.DEFAULT_DATA_DISK_SIZE_GB,
            publicIpType: 'dynamic',
            useSpot: false,
            ssh: {
                user: AWS_TEST_CONSTANTS.DEFAULT_SSH_USER,
                privateKeyPath: AWS_TEST_CONSTANTS.DEFAULT_SSH_KEY_PATH
            }
        },
        output: {
            host: AWS_TEST_CONSTANTS.DEFAULT_HOST,
            publicIPv4: AWS_TEST_CONSTANTS.DEFAULT_HOST,
            instanceId: AWS_TEST_CONSTANTS.DEFAULT_INSTANCE_ID,
            region: AWS_TEST_CONSTANTS.DEFAULT_REGION,
            zone: AWS_TEST_CONSTANTS.DEFAULT_ZONE,
            instanceServerName: 'test-aws-server',
            dataDiskId: 'vol-0123456789abcdef0'
        }
    },
    configuration: {
        configurator: 'ansible',
        input: {
            username: AWS_TEST_CONSTANTS.DEFAULT_USERNAME,
            passwordBase64: AWS_TEST_CONSTANTS.DEFAULT_PASSWORD_BASE64
        }
    },
    metadata: {
        lastProvisionDate: Date.now(),
        lastProvisionCloudypadVersion: '0.39.0'
    }
}

/**
 * AWS-specific Instance State Builder with Copy-on-Write optimization
 */
export class AwsInstanceStateBuilder extends GenericStateBuilder<AwsInstanceStateV1> {
    constructor(
        initialState: DeepReadonly<AwsInstanceStateV1> = AWS_DEFAULT_STATE,
        pendingChanges: Map<string, unknown> = new Map(),
        isCloned: boolean = false
    ) {
        super(initialState, pendingChanges, isCloned)
    }

    protected createInstance(
        state: DeepReadonly<AwsInstanceStateV1>,
        pendingChanges: Map<string, unknown>,
        isCloned: boolean
    ): this {
        return new AwsInstanceStateBuilder(state, pendingChanges, isCloned) as this
    }

    protected deepClone(state: DeepReadonly<AwsInstanceStateV1>): AwsInstanceStateV1 {
        // Use structuredClone for better performance when available (Node 17+)
        // Fallback to JSON for compatibility
        return (typeof structuredClone !== 'undefined' 
            ? structuredClone(state) 
            : JSON.parse(JSON.stringify(state))) as AwsInstanceStateV1
    }

    // AWS-specific builder methods with type safety
    withName(name: string): this {
        return this.createWithField('name', name)
    }

    withRegion(region: string): this {
        return this.createWithField('provision.input.region', region)
    }

    withZone(zone: string): this {
        return this.createWithField('provision.input.zone', zone)
    }

    withInstanceType(instanceType: string): this {
        return this.createWithField('provision.input.instanceType', instanceType)
    }

    withAmiId(amiId: string): this {
        return this.createWithField('provision.input.amiId', amiId)
    }

    withKeyPair(keyPair: string): this {
        return this.createWithField('provision.input.keyPair', keyPair)
    }

    withHost(host: string): this {
        return this.createWithField('provision.output.host', host)
    }

    withInstanceId(instanceId: string): this {
        return this.createWithField('provision.output.instanceId', instanceId)
    }

    withDataDiskId(dataDiskId: string): this {
        return this.createWithField('provision.output.dataDiskId', dataDiskId)
    }

    withDiskSize(sizeGb: number): this {
        return this.createWithField('provision.input.diskSizeGb', sizeGb)
    }

    withDataDiskSize(sizeGb: number): this {
        return this.createWithField('provision.input.dataDiskSizeGb', sizeGb)
    }

    withSshUser(username: string): this {
        return this.createWithField('provision.input.ssh.username', username)
    }

    withSshKeyPath(keyPath: string): this {
        return this.createWithField('provision.input.ssh.privateKeyPath', keyPath)
    }

    // Advanced configuration methods
    withSecurityGroup(securityGroupId: string): this {
        return this.createWithField('provision.input.securityGroupId', securityGroupId)
    }

    withSubnet(subnetId: string): this {
        return this.createWithField('provision.input.subnetId', subnetId)
    }

    withVpc(vpcId: string): this {
        return this.createWithField('provision.input.vpcId', vpcId)
    }

    // Configuration output methods
    withConfigurationOutput(username: string, passwordBase64?: string): this {
        const configOutput = {
            username,
            ...(passwordBase64 && { passwordBase64 })
        }
        return this.createWithField('configuration.output', configOutput)
    }

    // Batch field updates for efficiency
    withAwsFields(fields: {
        region?: string
        zone?: string
        instanceType?: string
        amiId?: string
        keyPair?: string
        host?: string
        instanceId?: string
        dataDiskId?: string
        diskSizeGb?: number
        dataDiskSizeGb?: number
    }): this {
        return this.withModification((state) => {
            if (fields.region !== undefined) state.provision.input.region = fields.region
            if (fields.zone !== undefined) state.provision.input.zone = fields.zone
            if (fields.instanceType !== undefined) state.provision.input.instanceType = fields.instanceType
            if (fields.amiId !== undefined) state.provision.input.amiId = fields.amiId
            if (fields.keyPair !== undefined) state.provision.input.keyPair = fields.keyPair
            if (fields.diskSizeGb !== undefined) state.provision.input.diskSizeGb = fields.diskSizeGb
            if (fields.dataDiskSizeGb !== undefined) state.provision.input.dataDiskSizeGb = fields.dataDiskSizeGb
            
            if (!state.provision.output) {
                state.provision.output = {} as NonNullable<AwsInstanceStateV1['provision']['output']>
            }
            if (fields.host !== undefined) state.provision.output.host = fields.host
            if (fields.instanceId !== undefined) state.provision.output.instanceId = fields.instanceId
            if (fields.dataDiskId !== undefined) state.provision.output.dataDiskId = fields.dataDiskId
        })
    }
}

/**
 * AWS-specific Test Data Factory
 */
export class AwsTestFactory extends GenericTestFactory<AwsInstanceStateV1, typeof AWS_TEST_CONSTANTS> {
    constructor() {
        super(AWS_TEST_CONSTANTS)
    }

    createMinimalState(): AwsInstanceStateV1 {
        return new AwsInstanceStateBuilder()
            .withName('minimal-aws')
            .withRegion(this.constants.DEFAULT_REGION)
            .withInstanceType(this.constants.DEFAULT_INSTANCE_TYPE)
            .buildMutable()
    }

    createFullState(): AwsInstanceStateV1 {
        return new AwsInstanceStateBuilder()
            .withName('full-aws-instance')
            .withAwsFields({
                region: this.constants.DEFAULT_REGION,
                zone: this.constants.DEFAULT_ZONE,
                instanceType: this.constants.DEFAULT_INSTANCE_TYPE,
                amiId: this.constants.DEFAULT_AMI_ID,
                keyPair: this.constants.DEFAULT_KEY_PAIR,
                host: this.constants.DEFAULT_HOST,
                instanceId: this.constants.DEFAULT_INSTANCE_ID,
                dataDiskId: 'vol-full-test',
                diskSizeGb: this.constants.DEFAULT_DISK_SIZE_GB,
                dataDiskSizeGb: this.constants.DEFAULT_DATA_DISK_SIZE_GB
            })
            .withConfigurationOutput(this.constants.DEFAULT_USERNAME, this.constants.DEFAULT_PASSWORD_BASE64)
            .buildMutable()
    }

    createStateWithConfig(config: Partial<Record<string, unknown>>): AwsInstanceStateV1 {
        let builder = new AwsInstanceStateBuilder()

        // Apply configuration dynamically
        if (config.region) builder = builder.withRegion(config.region as string)
        if (config.zone) builder = builder.withZone(config.zone as string)
        if (config.instanceType) builder = builder.withInstanceType(config.instanceType as string)
        if (config.amiId) builder = builder.withAmiId(config.amiId as string)
        if (config.keyPair) builder = builder.withKeyPair(config.keyPair as string)
        if (config.host) builder = builder.withHost(config.host as string)
        if (config.instanceId) builder = builder.withInstanceId(config.instanceId as string)
        if (config.dataDiskId) builder = builder.withDataDiskId(config.dataDiskId as string)

        return builder.buildMutable()
    }

    createInvalidState(): AwsInstanceStateV1 {
        return new AwsInstanceStateBuilder()
            .withName('') // Invalid empty name
            .withRegion('invalid-region') // Invalid region format
            .withInstanceType('') // Invalid empty instance type
            .withAmiId('invalid-ami') // Invalid AMI format
            .buildMutable()
    }

    // AWS-specific factory methods
    createStateForRegion(region: string): AwsInstanceStateV1 {
        const zone = `${region}a` // Default to first AZ
        return new AwsInstanceStateBuilder()
            .withRegion(region)
            .withZone(zone)
            .buildMutable()
    }

    createStateWithInstanceType(instanceType: string): AwsInstanceStateV1 {
        return new AwsInstanceStateBuilder()
            .withInstanceType(instanceType)
            .buildMutable()
    }

    createProvisionedState(): AwsInstanceStateV1 {
        return new AwsInstanceStateBuilder()
            .withAwsFields({
                host: this.constants.DEFAULT_HOST,
                instanceId: this.constants.DEFAULT_INSTANCE_ID,
                dataDiskId: 'vol-provisioned'
            })
            .buildMutable()
    }
}

/**
 * Mock AWS SDK Client for testing
 */
export interface MockAwsClient {
    describeInstances: sinon.SinonStub
    runInstances: sinon.SinonStub
    terminateInstances: sinon.SinonStub
    startInstances: sinon.SinonStub
    stopInstances: sinon.SinonStub
    createVolume: sinon.SinonStub
    attachVolume: sinon.SinonStub
    detachVolume: sinon.SinonStub
    deleteVolume: sinon.SinonStub
}

/**
 * AWS Test Environment using Generic Architecture
 */
export class AwsTestEnvironment extends GenericTestEnvironment<AwsInstanceStateV1, typeof AWS_TEST_CONSTANTS> {
    constructor() {
        const config: ProviderTestConfig<AwsInstanceStateV1, typeof AWS_TEST_CONSTANTS> = {
            providerName: 'aws',
            defaultState: AWS_DEFAULT_STATE,
            constants: AWS_TEST_CONSTANTS,
            cloneFunction: (state) => JSON.parse(JSON.stringify(state))
        }
        super(config)
    }

    /**
     * Create a mock AWS SDK client with all necessary stubs
     */
    createMockAwsClient(): MockAwsClient {
        const mockClient = {
            describeInstances: sinon.stub(),
            runInstances: sinon.stub(),
            terminateInstances: sinon.stub(),
            startInstances: sinon.stub(),
            stopInstances: sinon.stub(),
            createVolume: sinon.stub(),
            attachVolume: sinon.stub(),
            detachVolume: sinon.stub(),
            deleteVolume: sinon.stub()
        }

        // Set up default successful responses
        mockClient.describeInstances.resolves({
            Reservations: [{
                Instances: [{
                    InstanceId: AWS_TEST_CONSTANTS.DEFAULT_INSTANCE_ID,
                    State: { Name: 'running' },
                    PublicIpAddress: AWS_TEST_CONSTANTS.DEFAULT_HOST
                }]
            }]
        })

        mockClient.runInstances.resolves({
            Instances: [{
                InstanceId: AWS_TEST_CONSTANTS.DEFAULT_INSTANCE_ID,
                State: { Name: 'pending' }
            }]
        })

        this.registerProvider('awsClient', mockClient)
        return mockClient
    }
}

/**
 * 👨‍🎓 BEGINNER API: Simple AWS test helpers
 * Perfect for new developers - no complex generics!
 * 
 * @example Basic Usage
 * ```typescript
 * // ✅ SIMPLE - anyone can understand this
 * const aws = createAwsTest()
 * const state = aws.state()
 *   .withName('my-instance')
 *   .withRegion('us-east-1')
 *   .withInstanceType('t3.medium')
 *   .build()
 * 
 * const client = aws.mockClient()
 * client.runInstances.resolves({ Instances: [{ InstanceId: 'i-123' }] })
 * ```
 */
export interface AwsTestAPI {
    /** Create a state builder with fluent interface */
    state(): AwsSimpleBuilder
    /** Create a mock AWS client */
    mockClient(): MockAwsClient
    /** Clean up all test resources */
    cleanup(): void
}

export interface AwsSimpleBuilder {
    withName(name: string): this
    withRegion(region: string): this
    withInstanceType(type: string): this
    withAmi(amiId: string): this
    build(): AwsInstanceStateV1
}

class AwsTestHelper implements AwsTestAPI {
    private environment: AwsTestEnvironment
    
    constructor() {
        this.environment = new AwsTestEnvironment()
    }
    
    state(): AwsSimpleBuilder {
        return new AwsSimpleBuilderImpl()
    }
    
    mockClient(): MockAwsClient {
        const mockClient = {
            describeInstances: sinon.stub(),
            runInstances: sinon.stub(),
            terminateInstances: sinon.stub(),
            startInstances: sinon.stub(),
            stopInstances: sinon.stub(),
            createVolume: sinon.stub(),
            attachVolume: sinon.stub(),
            detachVolume: sinon.stub(),
            deleteVolume: sinon.stub()
        }
        this.environment.registerProvider('awsClient', mockClient)
        return mockClient
    }
    
    cleanup(): void {
        this.environment.cleanup()
    }
}

class AwsSimpleBuilderImpl implements AwsSimpleBuilder {
    private builder = new AwsInstanceStateBuilder()
    
    withName(name: string): this {
        this.builder = this.builder.withName(name)
        return this
    }
    
    withRegion(region: string): this {
        this.builder = this.builder.withRegion(region)
        return this
    }
    
    withInstanceType(type: string): this {
        this.builder = this.builder.withInstanceType(type)
        return this
    }
    
    withAmi(amiId: string): this {
        this.builder = this.builder.withAmiId(amiId)
        return this
    }
    
    build(): AwsInstanceStateV1 {
        return this.builder.buildMutable()
    }
}

/**
 * 🚀 BEGINNER-FRIENDLY: Create AWS test helper
 * Hides all complexity, provides intuitive API
 */
export function createAwsTest(): AwsTestAPI {
    return new AwsTestHelper()
}

/**
 * AWS Provider Test Setup implementing the generic interface (ADVANCED)
 */
export class AwsProviderTestSetup implements ProviderTestSetup<AwsInstanceStateV1, MockAwsClient, typeof AWS_TEST_CONSTANTS> {
    createEnvironment(): GenericTestEnvironment<AwsInstanceStateV1, typeof AWS_TEST_CONSTANTS> {
        return new AwsTestEnvironment()
    }

    createStateBuilder(initialState?: AwsInstanceStateV1): AwsInstanceStateBuilder {
        return new AwsInstanceStateBuilder(initialState)
    }

    createTestFactory(): AwsTestFactory {
        return new AwsTestFactory()
    }

    createSdkClientMock(): MockAwsClient {
        const environment = new AwsTestEnvironment()
        return environment.createMockAwsClient()
    }

    getProviderName(): string {
        return 'aws'
    }
}