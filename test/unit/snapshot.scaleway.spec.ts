import * as assert from 'assert'
import * as sinon from 'sinon'
import { buildProgram } from '../../src/cli/program'
import * as snapshotModule from '../../src/infrastructure/scaleway/snapshot'
import { 
    InstanceStateBuilder, 
    ScalewayEnvironment, 
    SinonStubManager, 
    TestDataFactory, 
    ScalewayTestSetup,
    ScalewayTestAssertions 
} from '../utils/scaleway-test-helpers'

describe('Scaleway snapshot functions', () => {
    const sandbox = sinon.createSandbox()
    let testSetup: ReturnType<typeof ScalewayTestSetup.createCompleteTestEnvironment>

    beforeEach(() => {
        sandbox.restore()
        testSetup = ScalewayTestSetup.createCompleteTestEnvironment(sandbox)
    })

    afterEach(() => {
        testSetup.cleanup()
    })

    describe('validateSnapshotName', () => {
        const validationTestCases = [
            { name: '', shouldFail: true, reason: 'empty name' },
            { name: 'a'.repeat(64), shouldFail: true, reason: 'too long' },
            { name: 'Valid-Name_123', shouldFail: false, reason: 'valid name with dash and underscore' },
            { name: 'Invalid.Name', shouldFail: true, reason: 'contains dot' },
            { name: 'Invalid Name', shouldFail: true, reason: 'contains space' },
            { name: 'Invalid-Name-', shouldFail: false, reason: 'ending dash is OK' },
            { name: 'valid-name', shouldFail: false, reason: 'simple valid name' }
        ]

        validationTestCases.forEach(({ name, shouldFail, reason }) => {
            it(`should ${shouldFail ? 'reject' : 'accept'} "${name}" (${reason})`, () => {
                if (shouldFail) {
                    assert.throws(() => snapshotModule.validateSnapshotName(name), Error)
                } else {
                    assert.doesNotThrow(() => snapshotModule.validateSnapshotName(name))
                }
            })
        })
    })
})

describe('Scaleway snapshot CLI', () => {
    const cliSandbox = sinon.createSandbox()
    let cliTestSetup: ReturnType<typeof ScalewayTestSetup.createCompleteTestEnvironment>

    beforeEach(() => {
        cliSandbox.restore()
        cliTestSetup = ScalewayTestSetup.createCompleteTestEnvironment(cliSandbox)
    })
    
    afterEach(() => {
        cliTestSetup.cleanup()
    })

    describe('snapshot creation', () => {
        it('should create snapshot with correct parameters', async () => {
            const program = buildProgram()
            const createStub = cliSandbox.stub(snapshotModule, 'createDataDiskSnapshot').resolves({ snapshotId: 'snap-1' })

            const cliArgs = TestDataFactory.cliArgs('nightly-2025-10-03')
            await program.parseAsync(cliArgs)

            ScalewayTestAssertions.assertSnapshotCallWithArgs(createStub, {
                snapshotName: 'nightly-2025-10-03',
                dataDiskId: '12345678-1234-1234-1234-123456789abc'
            })
        })

        it('should create snapshot and delete data disk when --delete-data-disk is specified', async () => {
            const program = buildProgram()
            const createStub = cliSandbox.stub(snapshotModule, 'createDataDiskSnapshot').resolves({ snapshotId: 'snap-temp' })
            const deleteStub = cliSandbox.stub(snapshotModule, 'snapshotAndDeleteDataDisk').resolves({ snapshotId: 'snap-success' })

            const cliArgs = TestDataFactory.cliArgs('test-snapshot', '--delete-data-disk', '--yes')
            await program.parseAsync(cliArgs)

            assert.strictEqual(createStub.calledOnce, true, 'Should call createDataDiskSnapshot once')
            assert.strictEqual(deleteStub.calledOnce, true, 'Should call snapshotAndDeleteDataDisk once')
        })
    })

    describe('snapshot restoration', () => {
        it('should restore snapshot with correct parameters', async () => {
            const program = buildProgram()
            const restoreStub = cliSandbox.stub(snapshotModule, 'restoreDataDiskSnapshot')
                .resolves({ newDataDiskId: '87654321-4321-4321-4321-987654321abc' })

            const cliArgs = TestDataFactory.cliArgs('nightly-2025-10-03', '--restore', '--yes')
            await program.parseAsync(cliArgs)

            ScalewayTestAssertions.assertSnapshotCallWithArgs(restoreStub, {
                snapshotName: 'nightly-2025-10-03',
                instanceName: 'test-instance',
                oldDataDiskId: '12345678-1234-1234-1234-123456789abc'
            })
        })

        it('should handle restoration failure gracefully', async () => {
            const program = buildProgram()
            const expectedError = new Error('ansible failed')
            const restoreSpy = cliSandbox.stub(snapshotModule, 'restoreDataDiskSnapshot').rejects(expectedError)

            const cliArgs = TestDataFactory.cliArgs('nightly-2025-10-03', '--restore', '--yes')
            
            await assert.rejects(
                async () => await program.parseAsync(cliArgs),
                expectedError,
                'Should propagate the restoration error'
            )

            assert.strictEqual(restoreSpy.calledOnce, true, 'Should attempt restoration once')
        })
    })

    describe('error handling', () => {
        it('should handle disk deletion failure during archive flow', async () => {
            const program = buildProgram()
            
            // Setup stubs
            cliSandbox.stub(snapshotModule, 'createDataDiskSnapshot').resolves({ snapshotId: 'snap-temp' })
            const expectedError = new Error('Critical: Failed to delete volume after 10 attempts')
            const archiveStub = cliSandbox.stub(snapshotModule, 'snapshotAndDeleteDataDisk').rejects(expectedError)

            const cliArgs = TestDataFactory.cliArgs('test-snapshot', '--delete-data-disk', '--yes')
            
            await assert.rejects(
                async () => await program.parseAsync(cliArgs),
                (error: Error) => error.message.includes('Critical: Failed to delete volume'),
                'Should propagate disk deletion failure'
            )

            assert.strictEqual(archiveStub.calledOnce, true, 'Should attempt archive operation once')
        })
    })
})
