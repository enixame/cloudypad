import * as assert from 'assert'
import { 
    CommonTypeGuards, 
    TypeGuardRegistry
} from '../../../src/core/type-guards'
import { ScalewayTypeGuards, ScalewayValidators } from '../../../src/providers/scaleway/type-guards'

describe('Generic Type Guards Architecture', () => {
    describe('CommonTypeGuards', () => {
        it('should validate strings correctly', () => {
            assert.strictEqual(CommonTypeGuards.string('hello'), true)
            assert.strictEqual(CommonTypeGuards.string(123), false)
            assert.strictEqual(CommonTypeGuards.string(null), false)
            assert.strictEqual(CommonTypeGuards.string(undefined), false)
        })

        it('should validate UUIDs correctly', () => {
            assert.strictEqual(CommonTypeGuards.uuid('12345678-1234-1234-1234-123456789abc'), true)
            assert.strictEqual(CommonTypeGuards.uuid('invalid-uuid'), false)
            assert.strictEqual(CommonTypeGuards.uuid('123'), false)
            assert.strictEqual(CommonTypeGuards.uuid(null), false)
        })

        it('should validate positive numbers correctly', () => {
            assert.strictEqual(CommonTypeGuards.positiveNumber(5), true)
            assert.strictEqual(CommonTypeGuards.positiveNumber(0), false)
            assert.strictEqual(CommonTypeGuards.positiveNumber(-1), false)
            assert.strictEqual(CommonTypeGuards.positiveNumber('5'), false)
        })

        it('should validate non-empty strings correctly', () => {
            assert.strictEqual(CommonTypeGuards.nonEmptyString('hello'), true)
            assert.strictEqual(CommonTypeGuards.nonEmptyString(''), false)
            assert.strictEqual(CommonTypeGuards.nonEmptyString('   '), true) // whitespace is allowed
            assert.strictEqual(CommonTypeGuards.nonEmptyString(null), false)
        })
    })

    describe('TypeGuardRegistry', () => {
        it('should register and retrieve Scaleway type guards', () => {
            const guards = TypeGuardRegistry.get('scaleway')
            assert.ok(guards, 'Scaleway guards should be registered')
            assert.ok(guards.zone, 'Zone guard should exist')
            assert.ok(guards.region, 'Region guard should exist')
        })

        it('should list registered providers', () => {
            const providers = TypeGuardRegistry.listProviders()
            assert.ok(providers.includes('scaleway'), 'Scaleway should be registered')
        })
    })
})

describe('Scaleway Type Guards', () => {
    describe('Basic Scaleway Validators', () => {
        it('should validate Scaleway zones', () => {
            assert.strictEqual(ScalewayTypeGuards.zone('fr-par-1'), true)
            assert.strictEqual(ScalewayTypeGuards.zone('nl-ams-1'), true)
            assert.strictEqual(ScalewayTypeGuards.zone('us-east-1'), false) // AWS format
            assert.strictEqual(ScalewayTypeGuards.zone('invalid'), false)
            assert.strictEqual(ScalewayTypeGuards.zone(''), false)
        })

        it('should validate Scaleway regions', () => {
            assert.strictEqual(ScalewayTypeGuards.region('fr-par'), true)
            assert.strictEqual(ScalewayTypeGuards.region('nl-ams'), true)
            assert.strictEqual(ScalewayTypeGuards.region('fr-par-1'), false) // zone format
            assert.strictEqual(ScalewayTypeGuards.region('invalid'), false)
        })

        it('should validate snapshot names', () => {
            assert.strictEqual(ScalewayTypeGuards.snapshotName('valid-name_123'), true)
            assert.strictEqual(ScalewayTypeGuards.snapshotName('simple'), true)
            assert.strictEqual(ScalewayTypeGuards.snapshotName('invalid.name'), false)
            assert.strictEqual(ScalewayTypeGuards.snapshotName('invalid name'), false)
            assert.strictEqual(ScalewayTypeGuards.snapshotName(''), false)
            assert.strictEqual(ScalewayTypeGuards.snapshotName('a'.repeat(64)), false) // too long
        })

        it('should validate commercial types', () => {
            assert.strictEqual(ScalewayTypeGuards.commercialType('GP1-XS'), true)
            assert.strictEqual(ScalewayTypeGuards.commercialType('DEV1-S'), true)
            assert.strictEqual(ScalewayTypeGuards.commercialType('invalid'), false)
            assert.strictEqual(ScalewayTypeGuards.commercialType(''), false)
        })
    })

    describe('Complex Scaleway Validators', () => {
        it('should validate volume responses', () => {
            const validVolume = {
                id: '12345678-1234-1234-1234-123456789abc',
                name: 'test-volume',
                status: 'available'
            }

            assert.strictEqual(ScalewayTypeGuards.volumeResponse(validVolume), true)
            assert.strictEqual(ScalewayTypeGuards.volumeResponse({}), true) // all optional
            assert.strictEqual(ScalewayTypeGuards.volumeResponse(null), false)
            assert.strictEqual(ScalewayTypeGuards.volumeResponse('string'), false)
        })

        it('should validate volumes with IOPS', () => {
            const volumeWithIOPS = {
                specs: {
                    perfIops: 5000
                }
            }

            const volumeWithoutIOPS = {
                id: 'test'
            }

            assert.strictEqual(ScalewayTypeGuards.volumeWithIOPS(volumeWithIOPS), true)
            assert.strictEqual(ScalewayTypeGuards.volumeWithIOPS(volumeWithoutIOPS), false)
            assert.strictEqual(ScalewayTypeGuards.volumeWithIOPS({ specs: { perfIops: 0 } }), false)
        })
    })

    describe('Scaleway Convenience Validators', () => {
        it('should validate volumes for snapshot operations', () => {
            const snapshotReadyVolume = {
                id: '12345678-1234-1234-1234-123456789abc',
                name: 'data-disk',
                status: 'available'
            }

            const incompleteVolume = {
                name: 'data-disk'
                // missing id
            }

            assert.strictEqual(ScalewayValidators.volumeForSnapshot(snapshotReadyVolume), true)
            assert.strictEqual(ScalewayValidators.volumeForSnapshot(incompleteVolume), false)
        })

        it('should validate configuration input', () => {
            const validConfig = {
                projectId: '12345678-1234-1234-1234-123456789abc',
                zone: 'fr-par-1',
                region: 'fr-par'
            }

            const invalidConfig = {
                projectId: 'invalid-uuid',
                zone: 'invalid-zone'
            }

            assert.strictEqual(ScalewayValidators.configInput(validConfig), true)
            assert.strictEqual(ScalewayValidators.configInput(invalidConfig), false)
        })
    })
})