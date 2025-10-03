import * as assert from 'assert'
import * as sinon from 'sinon'
import { buildProgram } from '../../src/cli/program'
import { ScalewayProviderClient } from '../../src/providers/scaleway/provider'
import * as snapshotInfra from '../../src/infrastructure/scaleway/snapshot'

// Mocks

describe('Scaleway snapshot CLI', () => {

    const sandbox = sinon.createSandbox()

    beforeEach(() => {
        sandbox.restore()
    })

    it('should create snapshot with correct name and tags', async () => {
        const program = buildProgram()

        // Mock provider state
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    sandbox.stub(ScalewayProviderClient.prototype as any, 'getInstanceState').resolves({
            version: '1',
            name: 'test-instance',
            provision: {
                provider: 'scaleway',
                input: { projectId: 'proj', region: 'fr-par', zone: 'fr-par-1', ssh: { user: 'ubuntu', privateKeyPath: './test/resources/ssh-key' }, instanceType: 'GPU', diskSizeGb: 20, dataDiskSizeGb: 100 },
                output: { host: '1.2.3.4', publicIPv4: '1.2.3.4', dataDiskId: 'vol-123', instanceServerId: 'srv-1' }
            },
            configuration: { configurator: 'ansible', input: { sunshine: { enable: true } } }
        })

        const createStub = sandbox.stub(snapshotInfra, 'createDataDiskSnapshot').resolves({ snapshotId: 'snap-1' })

        await program.parseAsync(['node', 'cloudypad', 'snapshot', 'scaleway', 'nightly-2025-10-03', '--name', 'test-instance'])

        assert.strictEqual(createStub.calledOnce, true)
        const callArg = createStub.firstCall.args[0]
        assert.strictEqual(callArg.snapshotName, 'nightly-2025-10-03')
        assert.strictEqual(callArg.dataDiskId, 'vol-123')
    })

    it('should restore snapshot and delete it after success', async () => {
        const program = buildProgram()

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    sandbox.stub(ScalewayProviderClient.prototype as any, 'getInstanceState').resolves({
            version: '1',
            name: 'test-instance',
            provision: {
                provider: 'scaleway',
                input: { projectId: 'proj', region: 'fr-par', zone: 'fr-par-1', ssh: { user: 'ubuntu', privateKeyPath: './test/resources/ssh-key' }, instanceType: 'GPU', diskSizeGb: 20, dataDiskSizeGb: 100 },
                output: { host: '1.2.3.4', publicIPv4: '1.2.3.4', dataDiskId: 'vol-123', instanceServerId: 'srv-1' }
            },
            configuration: { configurator: 'ansible', input: { sunshine: { enable: true } } }
        })

        const restoreStub = sandbox.stub(snapshotInfra, 'restoreDataDiskSnapshot').resolves()

        await program.parseAsync(['node', 'cloudypad', 'snapshot', 'scaleway', 'nightly-2025-10-03', '--restore', '--yes', '--name', 'test-instance'])

        assert.strictEqual(restoreStub.calledOnce, true)
        const callArg = restoreStub.firstCall.args[0]
        assert.strictEqual(callArg.snapshotName, 'nightly-2025-10-03')
        assert.strictEqual(callArg.instanceName, 'test-instance')
        assert.strictEqual(callArg.oldDataDiskId, 'vol-123')
    })

    it('should not delete snapshot on ansible failure', async () => {
        const program = buildProgram()

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    sandbox.stub(ScalewayProviderClient.prototype as any, 'getInstanceState').resolves({
            version: '1',
            name: 'test-instance',
            provision: {
                provider: 'scaleway',
                input: { projectId: 'proj', region: 'fr-par', zone: 'fr-par-1', ssh: { user: 'ubuntu', privateKeyPath: './test/resources/ssh-key' }, instanceType: 'GPU', diskSizeGb: 20, dataDiskSizeGb: 100 },
                output: { host: '1.2.3.4', publicIPv4: '1.2.3.4', dataDiskId: 'vol-123', instanceServerId: 'srv-1' }
            },
            configuration: { configurator: 'ansible', input: { sunshine: { enable: true } } }
        })

        const restoreSpy = sandbox.stub(snapshotInfra, 'restoreDataDiskSnapshot').rejects(new Error('ansible failed'))

        try {
            await program.parseAsync(['node', 'cloudypad', 'snapshot', 'scaleway', 'nightly-2025-10-03', '--restore', '--yes', '--name', 'test-instance'])
    } catch { /* expected */ }

        assert.strictEqual(restoreSpy.calledOnce, true)
    })
})
