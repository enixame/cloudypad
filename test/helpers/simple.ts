/**
 * 🎯 SIMPLE TEST HELPERS - Perfect for Beginners
 * 
 * This file provides beginner-friendly APIs that hide the complexity
 * of the generic test architecture. Perfect for new developers!
 * 
 * @example Quick Start
 * ```typescript
 * import { createScalewayTest, createAwsTest } from '../helpers/simple'
 * 
 * describe('My Test', () => {
 *   it('should create Scaleway instance', () => {
 *     const scw = createScalewayTest()
 *     
 *     const state = scw.state()
 *       .withName('test-instance')
 *       .withRegion('fr-par')
 *       .withCommercialType('DEV1-S')
 *       .build()
 *     
 *     const client = scw.mockClient()
 *     client.createServer.resolves({ id: 'srv-123' })
 *     
 *     // Your test logic here...
 *     
 *     scw.cleanup() // Don't forget cleanup!
 *   })
 * })
 * ```
 */

// Re-export simple APIs
export type { 
    ScalewayTestAPI,
    ScalewaySimpleBuilder
} from './providers/scaleway'

export type { 
    AwsTestAPI,
    AwsSimpleBuilder
} from './providers/aws'

// Import the actual functions
import { createScalewayTest } from './providers/scaleway'
import { createAwsTest } from './providers/aws'

// Re-export them
export { createScalewayTest, createAwsTest }

export {
    createSimpleTestHelper,
    type SimpleTestEnvironment,
    type SimpleStateBuilder
} from './generic'

/**
 * 🎯 Quick Test Setup - One-liner for common scenarios
 */
export const QuickTest = {
    /**
     * Create a minimal Scaleway test setup
     * @example
     * ```typescript
     * const { state, client, cleanup } = QuickTest.scaleway('test-instance')
     * ```
     */
    scaleway: (instanceName: string) => {
        const scw = createScalewayTest()
        return {
            state: scw.state().withName(instanceName).withRegion('fr-par').build(),
            client: scw.mockClient(),
            cleanup: () => scw.cleanup()
        }
    },

    /**
     * Create a minimal AWS test setup
     * @example
     * ```typescript
     * const { state, client, cleanup } = QuickTest.aws('test-instance')
     * ```
     */
    aws: (instanceName: string) => {
        const aws = createAwsTest()
        return {
            state: aws.state().withName(instanceName).withRegion('us-east-1').build(),
            client: aws.mockClient(),
            cleanup: () => aws.cleanup()
        }
    }
}

/**
 * 📚 Learning Path - Recommended progression for developers
 * 
 * 1. 🟢 BEGINNER: Use QuickTest for simple scenarios
 * 2. 🟡 INTERMEDIATE: Use createScalewayTest() / createAwsTest() 
 * 3. 🔴 ADVANCED: Use full generic architecture from './generic'
 * 
 * Each level provides more flexibility but requires more knowledge.
 */
export const LearningPath = {
    beginner: {
        description: "Start here! One-liner setups for common test scenarios",
        api: "QuickTest.scaleway() / QuickTest.aws()",
        example: "const { state, client, cleanup } = QuickTest.scaleway('test')"
    },
    intermediate: {
        description: "More flexibility with fluent builders, still simple",
        api: "createScalewayTest() / createAwsTest()",
        example: "const scw = createScalewayTest(); scw.state().withRegion('fr-par')"
    },
    advanced: {
        description: "Full power of generic architecture, maximum flexibility",
        api: "GenericTestEnvironment<TState, TConstants>",
        example: "Complex multi-provider coordination and custom builders"
    }
}