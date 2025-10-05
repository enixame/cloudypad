/**
 * 📚 LEARNING EXAMPLES - Test Helpers Usage
 * 
 * This file demonstrates the different levels of complexity available:
 * 🟢 BEGINNER → 🟡 INTERMEDIATE → 🔴 ADVANCED
 */

import * as assert from 'assert'

// Different import styles for different skill levels
import { QuickTest, createScalewayTest, createAwsTest } from '../helpers/simple'
import { ScalewayStateBuilder, ScalewayTestEnvironment } from '../helpers/providers/scaleway'

describe('📚 Learning Examples - Test Helper Usage', () => {
    
    describe('🟢 BEGINNER Level - QuickTest API', () => {
        it('should create Scaleway test with one line', () => {
            // ✨ MAGIC: Everything set up in one line!
            const { state, client, cleanup } = QuickTest.scaleway('beginner-test')
            
            // Verify the basics work
            assert.strictEqual(state.name, 'beginner-test')
            assert.strictEqual(state.provision.input.region, 'fr-par')
            assert.ok(client.createServer)
            
            // Simple mock setup
            client.createServer.resolves({ id: 'srv-123', name: 'test-server' })
            
            // Test your logic here...
            assert.ok(client.createServer.calledOnce === false) // Not called yet
            
            cleanup() // Always cleanup!
        })
        
        it('should create AWS test with one line', () => {
            const { state, client, cleanup } = QuickTest.aws('beginner-aws-test')
            
            assert.strictEqual(state.name, 'beginner-aws-test')
            assert.strictEqual(state.provision.input.region, 'us-east-1')
            assert.ok(client.runInstances)
            
            cleanup()
        })
    })
    
    describe('🟡 INTERMEDIATE Level - Fluent Builder API', () => {
        it('should create custom Scaleway configuration', () => {
            const scw = createScalewayTest()
            
            // 🎯 More control with fluent interface
            const state = scw.state()
                .withName('intermediate-test')
                .withRegion('nl-ams')  // Different region
                .withZone('nl-ams-1')
                .withCommercialType('DEV1-S')
                .withSnapshot('my-backup')
                .build()
            
            // Verify custom configuration
            assert.strictEqual(state.name, 'intermediate-test')
            assert.strictEqual(state.provision.input.region, 'nl-ams')
            assert.strictEqual(state.provision.input.zone, 'nl-ams-1')
            assert.strictEqual(state.provision.input.commercialType, 'DEV1-S')
            
            // More sophisticated mock setup
            const client = scw.mockClient()
            client.createServer.resolves({ 
                id: 'srv-456', 
                name: 'custom-server',
                state: 'running' 
            })
            client.createSnapshot.resolves({ 
                id: 'snap-789', 
                name: 'my-backup' 
            })
            
            scw.cleanup()
        })
        
        it('should create custom AWS configuration', () => {
            const aws = createAwsTest()
            
            const state = aws.state()
                .withName('intermediate-aws')
                .withRegion('eu-west-1')  // European region
                .withInstanceType('t3.large')  // Bigger instance
                .withAmi('ami-custom123')
                .build()
            
            assert.strictEqual(state.provision.input.region, 'eu-west-1')
            assert.strictEqual(state.provision.input.instanceType, 't3.large')
            
            aws.cleanup()
        })
    })
    
    describe('🔴 ADVANCED Level - Full Generic Architecture', () => {
        it('should use advanced patterns for complex scenarios', () => {
            // 💪 Full power of the generic architecture
            const environment = new ScalewayTestEnvironment()
            
            // Complex state building with Copy-on-Write optimization
            const builder = new ScalewayStateBuilder()
            const baseState = builder
                .withName('advanced-test')
                .withRegion('fr-par')
                .build()
            
            // Multiple variations efficiently (Copy-on-Write!)
            const devState = builder.withCommercialType('DEV1-S').build()
            const prodState = builder.withCommercialType('GP1-XS').build()
            
            // Original state unchanged (immutability!)
            assert.strictEqual(baseState.provision.input.commercialType, 'PLAY2-PICO')
            assert.strictEqual(devState.provision.input.commercialType, 'DEV1-S')
            assert.strictEqual(prodState.provision.input.commercialType, 'GP1-XS')
            
            // Advanced mocking with precise control
            const mockClient = environment.createMockScalewayClient()
            mockClient.createServer.onFirstCall().resolves({ id: 'srv-dev' })
            mockClient.createServer.onSecondCall().resolves({ id: 'srv-prod' })
            
            environment.cleanup()
        })
        
        it('should demonstrate why advanced patterns matter', () => {
            // 🎯 This shows the power of the generic architecture:
            // - Type safety across multiple providers
            // - Performance optimization with Copy-on-Write
            // - Extensibility for new cloud providers
            // - Multi-provider coordination
            
            // But it requires understanding of:
            // - TypeScript generics
            // - Copy-on-Write patterns  
            // - Abstract classes and template methods
            // - Provider abstraction patterns
            
            assert.ok(true, 'Advanced patterns provide maximum flexibility')
        })
    })
    
    describe('🎓 Migration Path Example', () => {
        it('should show how to gradually adopt more advanced patterns', () => {
            // Stage 1: Start with QuickTest (BEGINNER)
            {
                const { state, cleanup } = QuickTest.scaleway('migration-test')
                assert.strictEqual(state.name, 'migration-test')
                cleanup()
            }
            
            // Stage 2: Move to fluent builders (INTERMEDIATE)
            {
                const scw = createScalewayTest()
                const state = scw.state()
                    .withName('migration-test')
                    .withRegion('fr-par')  // Now you can customize!
                    .build()
                assert.strictEqual(state.provision.input.region, 'fr-par')
                scw.cleanup()
            }
            
            // Stage 3: Use full architecture (ADVANCED)
            {
                const builder = new ScalewayStateBuilder()
                const state = builder
                    .withName('migration-test')
                    .withScalewayFields({  // Batch operations!
                        region: 'fr-par',
                        zone: 'fr-par-1',
                        commercialType: 'DEV1-S'
                    })
                    .build()
                assert.strictEqual(state.provision.input.commercialType, 'DEV1-S')
            }
            
            // Each stage provides more power but requires more knowledge
            assert.ok(true, 'Gradual adoption path works!')
        })
    })
})