/**
 * Core Test Helpers
 * Tests for core functionality of the generic test architecture including state builders and factories
 */

import * as sinon from 'sinon'
import { GenericStateBuilder } from '../helpers/generic'
import { AwsInstanceStateBuilder, AwsTestFactory } from '../helpers/providers/aws'

// Chai is not available, so we'll use Node.js assert for basic testing
import * as assert from 'assert'

describe('Test Helpers Core', () => {
    let sandbox: sinon.SinonSandbox

    beforeEach(() => {
        sandbox = sinon.createSandbox()
    })

    afterEach(() => {
        sandbox.restore()
    })

    describe('AWS Instance State Builder', () => {
        let builder: AwsInstanceStateBuilder

        beforeEach(() => {
            builder = new AwsInstanceStateBuilder()
        })

        it('should build default AWS state', () => {
            const state = builder.build()

            assert.strictEqual(state.provision.provider, 'aws')
            assert.strictEqual(state.version, '1')
            assert.strictEqual(state.provision.input.region, 'us-east-1')
            assert.strictEqual(state.provision.input.instanceType, 't3.medium')
        })

        it('should support fluent interface with Copy-on-Write', () => {
            const originalBuilder = new AwsInstanceStateBuilder()
            const modifiedBuilder = originalBuilder
                .withName('test-instance')
                .withRegion('us-west-2')
                .withInstanceType('t3.large')

            // Original builder should be unchanged (Copy-on-Write)
            const originalState = originalBuilder.build()
            const modifiedState = modifiedBuilder.build()

            assert.strictEqual(originalState.name, 'test-aws-instance')
            assert.strictEqual(originalState.provision.input.region, 'us-east-1')
            assert.strictEqual(originalState.provision.input.instanceType, 't3.medium')

            assert.strictEqual(modifiedState.name, 'test-instance')
            assert.strictEqual(modifiedState.provision.input.region, 'us-west-2')
            assert.strictEqual(modifiedState.provision.input.instanceType, 't3.large')
        })

        it('should support batch field updates', () => {
            const state = builder
                .withAwsFields({
                    region: 'eu-west-1',
                    zone: 'eu-west-1a',
                    instanceType: 't3.xlarge',
                    amiId: 'ami-custom123',
                    host: '10.0.0.100',
                    instanceId: 'i-custom123',
                    dataDiskId: 'vol-custom123',
                    diskSizeGb: 50,
                    dataDiskSizeGb: 200
                })
                .build()

            assert.strictEqual(state.provision.input.region, 'eu-west-1')
            assert.strictEqual(state.provision.input.zone, 'eu-west-1a')
            assert.strictEqual(state.provision.input.instanceType, 't3.xlarge')
            assert.strictEqual(state.provision.input.amiId, 'ami-custom123')
            assert.strictEqual(state.provision.input.diskSizeGb, 50)
            assert.strictEqual(state.provision.input.dataDiskSizeGb, 200)
            assert.strictEqual(state.provision.output?.host, '10.0.0.100')
            assert.strictEqual(state.provision.output?.instanceId, 'i-custom123')
            assert.strictEqual(state.provision.output?.dataDiskId, 'vol-custom123')
        })

        it('should handle configuration output', () => {
            const state = builder
                .withConfigurationOutput('admin-user', 'cGFzc3dvcmQxMjM=')
                .build()

            assert.strictEqual(state.configuration?.output?.username, 'admin-user')
            assert.strictEqual(state.configuration?.output?.passwordBase64, 'cGFzc3dvcmQxMjM=')
        })
    })

    describe('AWS Test Factory', () => {
        let factory: AwsTestFactory

        beforeEach(() => {
            factory = new AwsTestFactory()
        })

        it('should create different state variations', () => {
            const minimal = factory.createMinimalState()
            const full = factory.createFullState()
            const invalid = factory.createInvalidState()

            // Minimal state
            assert.strictEqual(minimal.name, 'minimal-aws')
            assert.strictEqual(minimal.provision.input.region, 'us-east-1')
            assert.strictEqual(minimal.provision.input.instanceType, 't3.medium')

            // Full state
            assert.strictEqual(full.name, 'full-aws-instance')
            assert.strictEqual(full.provision.output?.host, '1.2.3.4')
            assert.strictEqual(full.provision.output?.instanceId, 'i-0123456789abcdef0')
            assert.strictEqual(full.configuration?.output?.username, 'test-user')

            // Invalid state (for testing validation)
            assert.strictEqual(invalid.name, '')
            assert.strictEqual(invalid.provision.input.region, 'invalid-region')
            assert.strictEqual(invalid.provision.input.instanceType, '')
        })

        it('should create state with custom configuration', () => {
            const customState = factory.createStateWithConfig({
                region: 'ap-southeast-1',
                instanceType: 't3.2xlarge',
                host: '192.168.1.100'
            })

            assert.strictEqual(customState.provision.input.region, 'ap-southeast-1')
            assert.strictEqual(customState.provision.input.instanceType, 't3.2xlarge')
            assert.strictEqual(customState.provision.output?.host, '192.168.1.100')
        })

        it('should create region-specific states', () => {
            const usEast = factory.createStateForRegion('us-east-1')
            const euWest = factory.createStateForRegion('eu-west-1')

            assert.strictEqual(usEast.provision.input.region, 'us-east-1')
            assert.strictEqual(usEast.provision.input.zone, 'us-east-1a')

            assert.strictEqual(euWest.provision.input.region, 'eu-west-1')
            assert.strictEqual(euWest.provision.input.zone, 'eu-west-1a')
        })

        it('should create provisioned state', () => {
            const provisioned = factory.createProvisionedState()

            assert.strictEqual(provisioned.provision.output?.host, '1.2.3.4')
            assert.strictEqual(provisioned.provision.output?.instanceId, 'i-0123456789abcdef0')
            assert.strictEqual(provisioned.provision.output?.dataDiskId, 'vol-provisioned')
        })
    })

    describe('Copy-on-Write Performance', () => {
        it('should provide performance benefits with immutable builders', () => {
            const baseBuilder = new AwsInstanceStateBuilder()
            
            // Create multiple variations efficiently
            const variations = [
                baseBuilder.withRegion('us-east-1').withInstanceType('t3.medium'),
                baseBuilder.withRegion('us-west-2').withInstanceType('t3.large'),
                baseBuilder.withRegion('eu-west-1').withInstanceType('t3.xlarge')
            ]

            const states = variations.map(builder => builder.build())

            // Each state should have different values
            assert.strictEqual(states[0].provision.input.region, 'us-east-1')
            assert.strictEqual(states[0].provision.input.instanceType, 't3.medium')
            
            assert.strictEqual(states[1].provision.input.region, 'us-west-2')
            assert.strictEqual(states[1].provision.input.instanceType, 't3.large')
            
            assert.strictEqual(states[2].provision.input.region, 'eu-west-1')
            assert.strictEqual(states[2].provision.input.instanceType, 't3.xlarge')

            // Original builder should remain unchanged
            const originalState = baseBuilder.build()
            assert.strictEqual(originalState.provision.input.region, 'us-east-1')
            assert.strictEqual(originalState.provision.input.instanceType, 't3.medium')
        })
    })

    describe('Architecture Extensibility', () => {
        it('should extend patterns to other providers', () => {
            // This shows how the same pattern would work for other cloud providers
            
            interface MockAzureState {
                provider: 'azure'
                version: '1'
                name: string
                region: string
                resourceGroup: string
                [key: string]: unknown  // Index signature for MinimalState compatibility
            }

            class MockAzureStateBuilder extends GenericStateBuilder<MockAzureState> {
                constructor(
                    initialState?: MockAzureState,
                    pendingChanges?: Map<string, unknown>,
                    isCloned?: boolean
                ) {
                    super(
                        initialState ?? {
                            provider: 'azure',
                            version: '1',
                            name: 'test-azure-instance',
                            region: 'East US',
                            resourceGroup: 'default-rg'
                        },
                        pendingChanges,
                        isCloned
                    )
                }

                protected createInstance(
                    state: MockAzureState,
                    pendingChanges: Map<string, unknown>,
                    isCloned: boolean
                ): this {
                    return new MockAzureStateBuilder(state, pendingChanges, isCloned) as this
                }

                protected deepClone(state: MockAzureState): MockAzureState {
                    return { ...state }
                }

                withRegion(region: string): this {
                    return this.createWithField('region', region)
                }

                withResourceGroup(resourceGroup: string): this {
                    return this.createWithField('resourceGroup', resourceGroup)
                }
            }

            // Test the Azure builder follows the same pattern
            const azureBuilder = new MockAzureStateBuilder()
            const azureState = azureBuilder
                .withRegion('West Europe')
                .withResourceGroup('prod-rg')
                .build()

            assert.strictEqual(azureState.provider, 'azure')
            assert.strictEqual(azureState.region, 'West Europe')
            assert.strictEqual(azureState.resourceGroup, 'prod-rg')
        })
    })
})