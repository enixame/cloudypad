import * as scw from '@pulumiverse/scaleway'
import * as pulumi from '@pulumi/pulumi'
import { InstancePulumiClient } from '../../tools/pulumi/client'
import { getLogger } from '../../log/utils'
import { ScalewayClient } from '../../providers/scaleway/sdk-client'
import { AnsibleConfigurator } from '../../configurators/ansible'
import { InstanceStateV1 } from '../../core/state/state'

export function validateSnapshotName(name: string){
    if(!/^[a-z0-9-_]{1,63}$/.test(name)){
        throw new Error('Invalid snapshot name. It must match [a-z0-9-_] and length ≤ 63.')
    }
}

export interface CreateSnapshotArgs {
    instanceName: string
    projectId: string
    zone: string
    dataDiskId: string
    snapshotName: string
}

export interface CreateSnapshotResult { snapshotId: string }

export interface RestoreSnapshotArgs {
    instanceName: string
    projectId: string
    zone: string
    instanceServerId: string
    oldDataDiskId: string
    snapshotName: string
    ssh: InstanceStateV1['provision']['input']['ssh']
    host: string
    publicIPv4?: string
    autoApprove?: boolean
    deleteOldDisk?: boolean
}

export interface ArchiveAfterSnapshotArgs extends CreateSnapshotArgs {
    instanceServerId: string
}

// Pulumi program to create a snapshot for an existing Block Volume
export function computeSnapshotResourceName(stack: string, snapshotName: string){
    return `cloudypad-${stack}-data-${snapshotName}`
}

export function computeRestoredVolumeResourceName(stack: string, snapshotName: string){
    return `cloudypad-${stack}-data-from-${snapshotName}`
}

function programCreateSnapshot(args: CreateSnapshotArgs){
    return async () => {
        const stack = pulumi.getStack()
        const name = computeSnapshotResourceName(stack, args.snapshotName)
        const tags = [ 'cloudypad', `stack:${stack}`, 'data-disk', `createdAt:${new Date().toISOString()}` ]
        const snap = new scw.block.Snapshot(name, {
            name,
            volumeId: pulumi.output(args.dataDiskId),
            tags,
        })
        return { snapshotId: snap.id }
    }
}

class CreateSnapshotClient extends InstancePulumiClient<{ projectId: string, region: string, zone: string }, { snapshotId: string }>{
    protected async doSetConfig(config: { projectId: string, region: string, zone: string }): Promise<void> {
        // eslint-disable-next-line @typescript-eslint/ban-ts-comment
        // @ts-ignore access protected
        const stack = await this.getStack()
        await stack.setConfig("scaleway:project_id", { value: config.projectId })
        await stack.setConfig("scaleway:region", { value: config.region })
        await stack.setConfig("scaleway:zone", { value: config.zone })
    }
    protected async buildTypedOutput(outputs: Record<string, { value: unknown }>): Promise<{ snapshotId: string }> {
        // our program returns a plain object, not Pulumi outputs, map it
        return { snapshotId: outputs['snapshotId']?.value as string }
    }
}

export async function createDataDiskSnapshot(args: CreateSnapshotArgs): Promise<CreateSnapshotResult>{
    const client = new CreateSnapshotClient({
        program: programCreateSnapshot(args),
        projectName: 'CloudyPad-Scaleway-Snapshot',
        stackName: args.instanceName,
    })
    await client.setConfig({ projectId: args.projectId, region: args.zone.split('-').slice(0,2).join('-'), zone: args.zone })
    const out = await client.up()
    return { snapshotId: out.snapshotId }
}

// Create a snapshot then delete the current data disk to reduce costs
export async function snapshotAndDeleteDataDisk(args: ArchiveAfterSnapshotArgs): Promise<CreateSnapshotResult> {
    const logger = getLogger('scw-snapshot-archive')
    // 1) Create snapshot first
    const snap = await createDataDiskSnapshot(args)

    // 2) Stop, detach, delete the data disk, start back
    const scwClient = new ScalewayClient('scw-archive', { projectId: args.projectId, zone: args.zone })
    try {
        await scwClient.stopInstance(args.instanceServerId, { wait: true, waitTimeoutSeconds: 300 })
        await scwClient.detachDataVolume(args.instanceServerId, args.dataDiskId)
        await scwClient.deleteBlockVolume(args.dataDiskId)
        await scwClient.startInstance(args.instanceServerId, { wait: true, waitTimeoutSeconds: 300 })
        logger.info(`Deleted data disk ${args.dataDiskId} after snapshot ${snap.snapshotId}`)
    } catch (e) {
        logger.error('Failed to delete data disk after snapshot. Instance may be running with disk still attached.', e)
        // Do not rollback snapshot creation; user can manage disk manually
    }

    return snap
}

// Pulumi program to create a new Volume from an existing Snapshot
function programCreateVolumeFromSnapshot(params: { stack: string, snapshotName: string }){
    return async () => {
        const volName = computeRestoredVolumeResourceName(params.stack, params.snapshotName)
        const snap = await scw.block.getSnapshot({ name: computeSnapshotResourceName(params.stack, params.snapshotName) })
        const vol = new scw.block.Volume(volName, { name: volName, iops: 5000, snapshotId: snap.id, tags: ['cloudypad', `stack:${params.stack}`, 'data-disk', `restoredFrom:${params.snapshotName}`] })
        return { newVolumeId: vol.id }
    }
}

class RestoreVolumeClient extends InstancePulumiClient<{ projectId: string, region: string, zone: string }, { newVolumeId: string }>{
    protected async doSetConfig(config: { projectId: string, region: string, zone: string }): Promise<void> {
        // eslint-disable-next-line @typescript-eslint/ban-ts-comment
        // @ts-ignore access protected
        const stack = await this.getStack()
        await stack.setConfig("scaleway:project_id", { value: config.projectId })
        await stack.setConfig("scaleway:region", { value: config.region })
        await stack.setConfig("scaleway:zone", { value: config.zone })
    }
    protected async buildTypedOutput(outputs: Record<string, { value: unknown }>): Promise<{ newVolumeId: string }> {
        return { newVolumeId: outputs['newVolumeId']?.value as string }
    }
}

export async function restoreDataDiskSnapshot(args: RestoreSnapshotArgs): Promise<void> {
    const logger = getLogger('scw-snapshot-restore')
    validateSnapshotName(args.snapshotName)

    // Build deterministic snapshot resource name to look it up
    const expectedName = computeSnapshotResourceName(args.instanceName, args.snapshotName)

    // Verify snapshot exists via Pulumi data source (best-effort): fallback to trying creation which will fail otherwise
    // Note: SDK lacks direct snapshot list in our wrapper; rely on Pulumi creation to error if not found when using id

    // Create new volume from snapshot
    const volClient = new RestoreVolumeClient({
        program: programCreateVolumeFromSnapshot({ stack: args.instanceName, snapshotName: args.snapshotName }),
        projectName: 'CloudyPad-Scaleway-RestoreVolume',
        stackName: args.instanceName,
    })
    await volClient.setConfig({ projectId: args.projectId, region: args.zone.split('-').slice(0,2).join('-'), zone: args.zone })
    const volOut = await volClient.up()
    const newVolumeIdFull = volOut.newVolumeId // zoned id like fr-par-1/uuid
    const newVolumeId = newVolumeIdFull.split('/').pop() as string

    const scwClient = new ScalewayClient('scw-attach', { projectId: args.projectId, zone: args.zone })

    // Safer path: stop instance for storage operations
    await scwClient.stopInstance(args.instanceServerId, { wait: true, waitTimeoutSeconds: 300 })

    // Detach old data disk then attach new one
    await scwClient.detachDataVolume(args.instanceServerId, args.oldDataDiskId)
    await scwClient.attachDataVolume(args.instanceServerId, newVolumeId)

    // Start instance again to let OS see the new disk
    await scwClient.startInstance(args.instanceServerId, { wait: true, waitTimeoutSeconds: 300 })

    // Run Ansible data-disk role via existing playbook through normal configurator
    // We reuse AnsibleConfigurator inventory generation with minimal state-like shapes
    const fakeProvisionInput = { ssh: { ...args.ssh } } as unknown as InstanceStateV1['provision']['input']
    const fakeProvisionOutput = { host: args.host, publicIPv4: args.publicIPv4, dataDiskId: newVolumeId } as unknown as NonNullable<InstanceStateV1['provision']['output']>
    const fakeConfigurationInput = { sunshine: { enable: true } } as unknown as InstanceStateV1['configuration']['input'] // tags handled via additional args

    const configurator = new AnsibleConfigurator<InstanceStateV1>({
        instanceName: args.instanceName,
        provider: 'scaleway',
        provisionInput: fakeProvisionInput,
        provisionOutput: fakeProvisionOutput,
        configurationInput: fakeConfigurationInput,
        additionalAnsibleArgs: ['-t', 'data-disk']
    })

    try {
        await configurator.configure()
    } catch (e) {
        logger.error('Ansible failed during snapshot restore. Keeping snapshot for manual recovery.', e)
        // rollback: stop, swap back disks, start
        try {
            await scwClient.stopInstance(args.instanceServerId, { wait: true, waitTimeoutSeconds: 300 })
            await scwClient.detachDataVolume(args.instanceServerId, newVolumeId)
            await scwClient.attachDataVolume(args.instanceServerId, args.oldDataDiskId)
            await scwClient.startInstance(args.instanceServerId, { wait: true, waitTimeoutSeconds: 300 })
        } catch (e2) {
            logger.error('Rollback failed: please check instance attachments manually.', e2)
        }
        throw e
    }

    // If we reach here, optionally delete old data disk to reduce costs
    if (args.deleteOldDisk) {
        try {
            await scwClient.stopInstance(args.instanceServerId, { wait: true, waitTimeoutSeconds: 300 })
            await scwClient.detachDataVolume(args.instanceServerId, args.oldDataDiskId)
            await scwClient.deleteBlockVolume(args.oldDataDiskId)
            await scwClient.startInstance(args.instanceServerId, { wait: true, waitTimeoutSeconds: 300 })
            logger.info(`Deleted old data disk ${args.oldDataDiskId}`)
        } catch (eDel) {
            logger.error(`Failed to delete old data disk ${args.oldDataDiskId}. You may delete it manually later.`, eDel)
        }
    }

    // Cleanup snapshot by destroying the transient stack used to create the snapshot resource
    // Create a minimal client to delete snapshot by name
    // noop pulumi client not used, kept for potential future cleanup via Pulumi
    // Use SDK because deleting by name through Pulumi would require tracking URN; simpler with API.
    try {
        await new ScalewayClient('scw-clean', { projectId: args.projectId, zone: args.zone }).deleteBlockSnapshotByName(expectedName)
    } catch (e) {
        logger.warn(`Failed to delete snapshot ${expectedName}: ${String((e as Error).message)}`)
    }
}
