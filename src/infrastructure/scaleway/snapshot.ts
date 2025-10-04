import * as scw from '@pulumiverse/scaleway'
import * as pulumi from '@pulumi/pulumi'
import { InstancePulumiClient } from '../../tools/pulumi/client'
import { getLogger } from '../../log/utils'
import { ScalewayClient } from '../../providers/scaleway/sdk-client'
import { AnsibleConfigurator } from '../../configurators/ansible'
import { createClient, Block } from '@scaleway/sdk'
import { loadProfileFromConfigurationFile } from '@scaleway/configuration-loader'
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
    // Stop and detach
    try {
        await scwClient.stopInstance(args.instanceServerId, { wait: true, waitTimeoutSeconds: 300 })
        try {
            await scwClient.detachDataVolume(args.instanceServerId, args.dataDiskId)
        } catch (eDet: unknown) {
            const err = eDet as Error
            const msg = String(err.message || eDet)
            if (msg.includes('ResourceNotFoundError') || msg.includes('instance_volume') || msg.includes('404')) {
                logger.warn(`Detach reported volume not attached; continuing deletion. Details: ${msg}`)
            } else {
                throw err
            }
        }
    } catch (e) {
        logger.error('Failed to stop and/or detach data disk before deletion.', e)
    }

    // Delete with retry on transient in_use/protected_resource errors
    {
        const maxRetries = 10
        const delayMs = 3000
        for (let attempt = 1; attempt <= maxRetries; attempt++) {
            try {
                await scwClient.deleteBlockVolume(args.dataDiskId)
                logger.info(`Deleted data disk ${args.dataDiskId} after snapshot ${snap.snapshotId}`)
                break
            } catch (eDel: unknown) {
                const err = eDel as Error
                const msg = String(err.message || eDel)
                if (msg.includes('in_use') || msg.includes('protected_resource') || msg.includes('412')) {
                    if (attempt < maxRetries) {
                        logger.warn(`Volume ${args.dataDiskId} still in use (attempt ${attempt}/${maxRetries}). Retrying in ${Math.round(delayMs/1000)}s...`)
                        await new Promise(r => setTimeout(r, delayMs))
                        continue
                    }
                }
                logger.error(`Failed to delete data disk ${args.dataDiskId} after ${attempt} attempts. You may delete it manually later.`, err)
                break
            }
        }
    }

    // Always try to start instance back
    try {
        await scwClient.startInstance(args.instanceServerId, { wait: true, waitTimeoutSeconds: 300 })
    } catch (e) {
        logger.error('Failed to start instance after archive flow; please start it manually.', e)
    }

    return snap
}

// Pulumi program to create a new Volume from an existing Snapshot
function programCreateVolumeFromSnapshot(params: { stack: string, snapshotName: string, iops?: number }){
    return async () => {
        const volName = computeRestoredVolumeResourceName(params.stack, params.snapshotName)
        const snap = await scw.block.getSnapshot({ name: computeSnapshotResourceName(params.stack, params.snapshotName) })
        const vol = new scw.block.Volume(volName, { name: volName, iops: params.iops ?? 5000, snapshotId: snap.id, tags: ['cloudypad', `stack:${params.stack}`, 'data-disk', `restoredFrom:${params.snapshotName}`] })
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
    // Try to keep same IOPS as the original data disk if possible
    let desiredIops: number | undefined = undefined
    try {
        const client = createClient({ ...loadProfileFromConfigurationFile(), defaultZone: args.zone })
        const scwBlock = new Block.v1alpha1.API(client)
    const volInfo = await scwBlock.getVolume({ volumeId: args.oldDataDiskId })
    desiredIops = (volInfo.specs?.perfIops as number | undefined) || undefined
        if (desiredIops) logger.debug(`Detected original data disk perfIops=${desiredIops}`)
    } catch (e) {
        logger.warn(`Could not detect original data disk IOPS; defaulting to 5000. ${String((e as Error).message)}`)
    }

    const volClient = new RestoreVolumeClient({
        program: programCreateVolumeFromSnapshot({ stack: args.instanceName, snapshotName: args.snapshotName, iops: desiredIops }),
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

    // Detach old data disk then attach new one (tolerate when already not attached)
    try {
        await scwClient.detachDataVolume(args.instanceServerId, args.oldDataDiskId)
    } catch (eDet: unknown) {
        const err = eDet as Error
        const msg = String(err.message || eDet)
        if (msg.includes('not attached to this server') || msg.includes('InvalidArgumentsError') || msg.includes('ResourceNotFoundError') || msg.includes('404')) {
            logger.warn(`Old data disk ${args.oldDataDiskId} reported as not attached; continuing restore. Details: ${msg}`)
        } else {
            throw err
        }
    }
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
            try {
                await scwClient.detachDataVolume(args.instanceServerId, newVolumeId)
            } catch (eDet: unknown) {
                const msg = String((eDet as Error).message || eDet)
                if (msg.includes('not attached') || msg.includes('InvalidArgumentsError') || msg.includes('ResourceNotFoundError') || msg.includes('404')) {
                    logger.warn(`New volume ${newVolumeId} not attached during rollback; continuing attach of old disk`)
                } else {
                    throw eDet
                }
            }
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
            try {
                await scwClient.detachDataVolume(args.instanceServerId, args.oldDataDiskId)
            } catch (eDet: unknown) {
                const err = eDet as Error
                const msg = String(err.message || eDet)
                if (msg.includes('ResourceNotFoundError') || msg.includes('instance_volume') || msg.includes('404')) {
                    logger.warn(`Old disk detach reported not attached; continuing deletion. Details: ${msg}`)
                } else {
                    throw err
                }
            }
            // Delete with retry loop
            const maxRetries = 10
            const delayMs = 3000
            for (let attempt = 1; attempt <= maxRetries; attempt++) {
                try {
                    await scwClient.deleteBlockVolume(args.oldDataDiskId)
                    logger.info(`Deleted old data disk ${args.oldDataDiskId}`)
                    break
                } catch (eDel: unknown) {
                    const err = eDel as Error
                    const msg = String(err.message || eDel)
                    if (msg.includes('in_use') || msg.includes('protected_resource') || msg.includes('412')) {
                        if (attempt < maxRetries) {
                            logger.warn(`Old volume ${args.oldDataDiskId} still in use (attempt ${attempt}/${maxRetries}). Retrying in ${Math.round(delayMs/1000)}s...`)
                            await new Promise(r => setTimeout(r, delayMs))
                            continue
                        }
                    }
                    logger.error(`Failed to delete old data disk ${args.oldDataDiskId} after ${attempt} attempts.`, err)
                    break
                }
            }
        } catch (eDel) {
            logger.error(`Failed to delete old data disk ${args.oldDataDiskId}. You may delete it manually later.`, eDel)
        } finally {
            try {
                await scwClient.startInstance(args.instanceServerId, { wait: true, waitTimeoutSeconds: 300 })
            } catch (e) {
                logger.error('Failed to start instance after old disk deletion flow; please start it manually.', e)
            }
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
