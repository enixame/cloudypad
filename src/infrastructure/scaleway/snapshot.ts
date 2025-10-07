import * as scw from '@pulumiverse/scaleway'
import * as pulumi from '@pulumi/pulumi'
import { InstancePulumiClient } from '../../tools/pulumi/client'
import { getLogger } from '../../log/utils'
import { ScalewayClient } from '../../providers/scaleway/sdk-client'
import { createClient, Block } from '@scaleway/sdk'
import { loadProfileFromConfigurationFile } from '@scaleway/configuration-loader'
import { InstanceStateV1 } from '../../core/state/state'
import { CoreConfig } from '../../core/config/interface'
import { ScalewayErrorUtils } from '../../tools/scaleway-error-utils'
import { SCALEWAY_TIMEOUTS, SCALEWAY_STORAGE, SCALEWAY_API } from '../../providers/scaleway/constants'
import { ScalewayTypeGuards } from '../../providers/scaleway/type-guards'
import { ScalewayValidators as UnifiedScalewayValidators } from '../../providers/scaleway/validation/patterns'

export function validateSnapshotName(name: string){
    if(!UnifiedScalewayValidators.isValidSnapshotName(name)){
        throw ScalewayErrorUtils.createInvalidSnapshotNameError(name)
    }
}

/**
 * Utility class for common Scaleway volume operations with proper error handling and retries
 */
class ScalewayVolumeOperations {
    private readonly logger = getLogger('ScalewayVolumeOperations')
    
    constructor(private client: ScalewayClient) {}
    
    /**
     * Safely detach a volume with proper error handling for common cases
     */
    async safeDetachVolume(instanceServerId: string, volumeId: string, volumeType: 'data' | 'old' = 'data'): Promise<void> {
        try {
            await this.client.detachDataVolume(instanceServerId, volumeId)
        } catch (error: unknown) {
            const err = error instanceof Error ? error : new Error(String(error))
            const msg = err.message
            if (msg.includes('ResourceNotFoundError') || 
                msg.includes('instance_volume') || 
                msg.includes('not attached') || 
                msg.includes('InvalidArgumentsError') || 
                msg.includes('404')) {
                this.logger.warn(`${volumeType} volume detach reported not attached; continuing`, {
                    volumeId,
                    error: msg
                })
            } else {
                throw err
            }
        }
    }
    
    /**
     * Delete volume with retry logic for common transient errors
     */
    async deleteVolumeWithRetry(volumeId: string, context: string = ''): Promise<void> {
        const maxRetries = SCALEWAY_TIMEOUTS.VOLUME_DELETE_MAX_RETRIES
        const delayMs = SCALEWAY_TIMEOUTS.VOLUME_DELETE_RETRY_DELAY
        
        for (let attempt = 1; attempt <= maxRetries; attempt++) {
            try {
                await this.client.deleteBlockVolume(volumeId)
                this.logger.info(`Deleted volume ${volumeId}${context ? ` (${context})` : ''}`)
                return
            } catch (error: unknown) {
                const err = error instanceof Error ? error : new Error(String(error))
                const msg = err.message
                
                if (msg.includes('in_use') || msg.includes('protected_resource') || msg.includes('412')) {
                    if (attempt < maxRetries) {
                        this.logger.warn('Volume deletion retry', {
                            volumeId,
                            attempt,
                            maxRetries,
                            delayMs,
                            context,
                            error: msg
                        })
                        await new Promise(r => setTimeout(r, delayMs))
                        continue
                    }
                    // Max retries reached - critical failure
                    throw new Error(`Critical: Failed to delete volume ${volumeId} after ${maxRetries} attempts${context ? ` (${context})` : ''}. Error: ${err.message}`)
                }
                // Non-retryable error - also critical
                throw new Error(`Critical: Cannot delete volume ${volumeId}${context ? ` (${context})` : ''}. Error: ${err.message}`)
            }
        }
    }
}

/**
 * Utility class for Pulumi stack management and cleanup
 */
class PulumiStackManager {
    private readonly logger = getLogger('PulumiStackManager')
    
    /**
     * Clean up orphaned Pulumi stacks and locks for a specific project
     */
    async cleanupOrphanedStack(projectName: string, stackName: string): Promise<void> {
        const pulumiBackendPath = `${process.env.HOME}/.cloudypad/pulumi-backend/.pulumi`
        
        try {
            // Clean up locks
            const lockPattern = `${pulumiBackendPath}/locks/organization/${projectName}/${stackName}/*.json`
            await this.runCommand(`rm -f ${lockPattern}`)
            
            // Check if stack exists and has problematic resources
            const stackPath = `${pulumiBackendPath}/stacks/${projectName}/${stackName}.json`
            const stackExists = await this.fileExists(stackPath)
            
            if (stackExists) {
                // Check if stack actually has resources before considering it orphaned
                const hasResources = await this.stackHasResources(stackPath)
                if (hasResources) {
                    this.logger.warn(`Found potentially orphaned stack with resources: ${projectName}/${stackName}`)
                    // Could add logic here to check stack state and decide on cleanup
                } else {
                    this.logger.info(`Cleaning up empty stack: ${projectName}/${stackName}`)
                    await this.cleanupEmptyStack(stackPath)
                }
            }
            
        } catch (e) {
            this.logger.warn('Stack cleanup encountered issues (non-critical)', e)
        }
    }
    
    /**
     * Force destroy a problematic stack when recovery is needed
     */
    async forceDestroyStack(projectName: string, stackName: string): Promise<void> {
        const pulumiBackendPath = `${process.env.HOME}/.cloudypad/pulumi-backend/.pulumi`
        
        this.logger.warn(`Force destroying stack: ${projectName}/${stackName}`)
        
        try {
            // Remove stack files, history, and backups
            await this.runCommand(`rm -rf "${pulumiBackendPath}/stacks/${projectName}/${stackName}.json"`)
            await this.runCommand(`rm -rf "${pulumiBackendPath}/history/${projectName}/${stackName}/"`)
            await this.runCommand(`rm -rf "${pulumiBackendPath}/backups/${projectName}/${stackName}/"`)
            await this.runCommand(`rm -rf "${pulumiBackendPath}/locks/organization/${projectName}/${stackName}/"`)
            
            this.logger.info(`Successfully destroyed orphaned stack: ${projectName}/${stackName}`)
        } catch (e) {
            this.logger.error('Failed to force destroy stack', e)
            throw e
        }
    }
    
    private async runCommand(command: string): Promise<void> {
        const { exec } = await import('child_process')
        const { promisify } = await import('util')
        const execAsync = promisify(exec)
        
        try {
            await execAsync(command)
        } catch (e) {
            // Ignore file not found errors (expected for cleanup)
            if (e && typeof e === 'object' && 'code' in e && e.code !== 2) {
                throw e
            }
        }
    }
    
    async fileExists(path: string): Promise<boolean> {
        try {
            const fs = await import('fs')
            await fs.promises.access(path)
            return true
        } catch {
            return false
        }
    }
    
    async findFiles(pattern: string): Promise<string[]> {
        try {
            const { exec } = await import('child_process')
            const { promisify } = await import('util')
            const execAsync = promisify(exec)
            
            const { stdout } = await execAsync(`find ${pattern} 2>/dev/null || true`)
            return stdout.trim().split('\n').filter(line => line.length > 0)
        } catch {
            return []
        }
    }
    
    /**
     * Check if a stack file contains actual resources
     */
    private async stackHasResources(stackPath: string): Promise<boolean> {
        try {
            const fs = await import('fs')
            const stackContent = await fs.promises.readFile(stackPath, 'utf8')
            const stack = JSON.parse(stackContent)
            
            // A stack with resources should have deployment.resources with more than 0 items
            const resourceCount = stack.deployment?.resources?.length || 0
            return resourceCount > 0
        } catch {
            // If we can't read the stack, assume it has resources to be safe
            return true
        }
    }
    
    /**
     * Remove empty stack files safely
     */
    private async cleanupEmptyStack(stackPath: string): Promise<void> {
        try {
            const fs = await import('fs')
            const path = await import('path')
            
            // Remove all related files (.json, .json.bak, .json.attrs, .json.bak.attrs)
            const stackDir = path.dirname(stackPath)
            const stackBasename = path.basename(stackPath, '.json')
            
            const filesToRemove = [
                `${stackBasename}.json`,
                `${stackBasename}.json.bak`, 
                `${stackBasename}.json.attrs`,
                `${stackBasename}.json.bak.attrs`
            ]
            
            for (const filename of filesToRemove) {
                const fullPath = path.join(stackDir, filename)
                try {
                    await fs.promises.unlink(fullPath)
                    this.logger.debug(`Removed empty stack file: ${fullPath}`)
                } catch (e) {
                    // Only log errors that aren't "file not found" (ENOENT)
                    if (e instanceof Error && 'code' in e && e.code !== 'ENOENT') {
                        this.logger.warn(`Failed to remove ${fullPath}:`, e)
                    }
                }
            }
            
            // Try to remove the directory if it's empty
            try {
                const dirContents = await fs.promises.readdir(stackDir)
                if (dirContents.length === 0) {
                    await fs.promises.rmdir(stackDir)
                    this.logger.debug(`Removed empty stack directory: ${stackDir}`)
                }
            } catch {
                // Directory not empty or other error, ignore
            }
            
        } catch (error) {
            this.logger.warn(`Failed to cleanup empty stack ${stackPath}:`, error)
        }
    }
}

/**
 * Utility class for common instance lifecycle operations
 */
class ScalewayInstanceOperations {
    private readonly logger = getLogger('ScalewayInstanceOperations')
    
    constructor(private client: ScalewayClient) {}
    
    /**
     * Stop instance and detach volume safely
     */
    async stopAndDetachVolume(instanceServerId: string, volumeId: string, volumeType: 'data' | 'old' = 'data'): Promise<void> {
        const volumeOps = new ScalewayVolumeOperations(this.client)
        
        try {
            await this.client.stopInstance(instanceServerId, { 
                wait: true, 
                waitTimeoutSeconds: SCALEWAY_TIMEOUTS.INSTANCE_OPERATION_TIMEOUT 
            })
            await volumeOps.safeDetachVolume(instanceServerId, volumeId, volumeType)
        } catch (e) {
            this.logger.error(`Failed to stop and/or detach ${volumeType} volume`, e)
            throw e
        }
    }
    
    /**
     * Start instance with consistent timeout and error handling
     */
    async safeStartInstance(instanceServerId: string, context: string = ''): Promise<void> {
        try {
            await this.client.startInstance(instanceServerId, { 
                wait: true, 
                waitTimeoutSeconds: SCALEWAY_TIMEOUTS.INSTANCE_OPERATION_TIMEOUT 
            })
        } catch (e) {
            this.logger.error(`Failed to start instance${context ? ` ${context}` : ''}; please start it manually.`, e)
            throw e
        }
    }
}

/**
 * Normalizes Scaleway volume IDs by extracting the UUID from zoned format
 * @param id - Volume ID in format 'zone/uuid' or just 'uuid'
 * @returns The UUID part or undefined if empty
 */
function normalizeVolumeId(id?: string): string | undefined {
    if (!id) return undefined
    if (id.includes('/')) {
        const parts = id.split('/')
        const lastPart = parts[parts.length - 1]
        return lastPart || undefined
    }
    return id
}

/**
 * Validates that the volume to delete is not the root volume
 */
async function validateNotRootVolume(
    client: ScalewayClient, 
    instanceServerId: string, 
    volumeId: string, 
    logger: ReturnType<typeof getLogger>
): Promise<void> {
    try {
        const srv = await client.getRawServerData(instanceServerId)
        
        let rootId: string | undefined
        if (ScalewayTypeGuards.serverWithRootVolume(srv)) {
            rootId = normalizeVolumeId(srv.rootVolume?.volumeId)
        }
        if (rootId && normalizeVolumeId(volumeId) === rootId) {
            throw new Error(`Refusing to delete root disk ${rootId}. The data disk to archive matches the root volume.`)
        }
    } catch (e) {
        if (e instanceof Error && e.message.startsWith('Refusing to delete root disk')) {
            logger.error(e.message)
            throw e
        }
        // If we cannot fetch server data, continue but deletion phase will still only ever target volumeId
        const errorMsg = e instanceof Error ? e.message : String(e)
        logger.warn(`Could not verify root volume before deletion: ${errorMsg}`)
    }
}

export interface CreateSnapshotArgs {
    readonly instanceName: string
    readonly projectId: string 
    readonly zone: string
    readonly dataDiskId: string
    readonly snapshotName: string
}

export interface CreateSnapshotResult { 
    readonly snapshotId: string 
}

export interface RestoreSnapshotArgs {
    readonly instanceName: string
    readonly projectId: string
    readonly zone: string
    readonly instanceServerId: string
    readonly oldDataDiskId?: string
    readonly snapshotName: string
    readonly ssh: InstanceStateV1['provision']['input']['ssh']
    readonly host: string
    readonly publicIPv4?: string
    readonly autoApprove?: boolean
    readonly deleteOldDisk?: boolean
    readonly deleteSnapshot?: boolean
    readonly coreConfig?: CoreConfig
}

export interface ArchiveAfterSnapshotArgs extends CreateSnapshotArgs {
    readonly instanceServerId: string
}

export interface RestoreSnapshotResult {
    readonly newDataDiskId: string
}

/**
 * Configuration for stack-based operations to prevent orphaned resources
 */
export interface StackOperationOptions {
    /** Whether to cleanup orphaned stacks before operation */
    cleanupBefore?: boolean
    /** Whether to cleanup stacks after successful operation */
    cleanupAfter?: boolean
    /** Whether to use persistent stacks instead of temporary ones */
    usePersistentStack?: boolean
    /** Timeout for stack operations in seconds */
    timeoutSeconds?: number
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
        // Access protected method through proper inheritance
        const stack = await this.getStack()
        await stack.setConfig("scaleway:project_id", { value: config.projectId })
        await stack.setConfig("scaleway:region", { value: config.region })
        await stack.setConfig("scaleway:zone", { value: config.zone })
    }
    protected async buildTypedOutput(outputs: Record<string, { value: unknown }>): Promise<{ snapshotId: string }> {
        // our program returns a plain object, not Pulumi outputs, map it
        const snapshotIdValue = outputs['snapshotId']?.value
        if (typeof snapshotIdValue !== 'string') {
            throw new Error(`Expected string snapshot ID, got ${typeof snapshotIdValue}`)
        }
        return { snapshotId: snapshotIdValue }
    }
}

export async function createDataDiskSnapshot(args: CreateSnapshotArgs): Promise<CreateSnapshotResult>{
    // Validate input parameters
    validateSnapshotName(args.snapshotName)
    if (!args.instanceName.trim()) {
        throw new Error('Instance name cannot be empty')
    }
    if (!args.dataDiskId.trim()) {
        throw new Error('Data disk ID cannot be empty')
    }
    
    // Pre-check: ensure the source volume still exists (it may have been deleted by a previous archive)
    try {
        const client = createClient({ ...loadProfileFromConfigurationFile(), defaultZone: args.zone })
        const block = new Block.v1alpha1.API(client)
        await block.getVolume({ volumeId: args.dataDiskId })
    } catch (e) {
        const normalized = ScalewayErrorUtils.normalizeError(e, 'Data disk volume validation')
        throw ScalewayErrorUtils.createScalewayError(
            `Data disk volume '${args.dataDiskId}' not found in zone '${args.zone}'. ` +
            `You likely archived/deleted the data disk earlier. ` +
            `Restore a snapshot first (cloudypad snapshot scaleway <name> --restore --name ${args.instanceName}) ` +
            `or create a new data disk (update the instance with a data-disk size) before snapshotting.\nDetails: ${normalized.message}`,
            e
        )
    }

    const client = new CreateSnapshotClient({
        program: programCreateSnapshot(args),
        projectName: 'CloudyPad-Scaleway-Snapshot',
        stackName: args.instanceName,
    })
    await client.setConfig({ projectId: args.projectId, region: args.zone.split('-').slice(0,SCALEWAY_API.REGION_ZONE_SPLIT_INDEX).join('-'), zone: args.zone })
    const out = await client.up()
    return { snapshotId: out.snapshotId }
}

// Create a snapshot then delete the current data disk to reduce costs
export async function snapshotAndDeleteDataDisk(args: ArchiveAfterSnapshotArgs): Promise<CreateSnapshotResult> {
    const logger = getLogger('scw-snapshot-archive')
    
    // Validate input parameters
    validateSnapshotName(args.snapshotName)
    if (!args.instanceServerId.trim()) {
        throw new Error('Instance server ID cannot be empty')
    }
    
    // 1) Create snapshot first
    const snap = await createDataDiskSnapshot(args)

    // 2) Stop, detach, delete the data disk, start back
    const scwClient = new ScalewayClient('scw-archive', { projectId: args.projectId, zone: args.zone })
    const instanceOps = new ScalewayInstanceOperations(scwClient)
    const volumeOps = new ScalewayVolumeOperations(scwClient)
    
    // Safety: never delete the root volume. Compute root volume id and compare.
    await validateNotRootVolume(scwClient, args.instanceServerId, args.dataDiskId, logger)

    // Stop and detach
    try {
        await instanceOps.stopAndDetachVolume(args.instanceServerId, args.dataDiskId, 'data')
    } catch (e) {
        logger.error('Failed to stop and/or detach data disk before deletion.', e)
        throw e
    }

    // Delete with retry on transient in_use/protected_resource errors
    await volumeOps.deleteVolumeWithRetry(args.dataDiskId, `after snapshot ${snap.snapshotId}`)

    // Always try to start instance back
    try {
        await instanceOps.safeStartInstance(args.instanceServerId, 'after archive flow')
    } catch (e) {
        // Don't rethrow - snapshot and deletion succeeded
        logger.error('Archive completed but failed to start instance; please start it manually.', e)
    }

    return snap
}

/**
 * Enhanced Pulumi program that creates volume with conditional logic
 * Uses persistent stack approach to avoid orphaned resources
 */
function programCreateVolumeFromSnapshotPersistent(params: { 
    stack: string, 
    snapshotName: string, 
    iops?: number,
    operation: 'create' | 'cleanup' 
}){
    return async () => {
        const volName = computeRestoredVolumeResourceName(params.stack, params.snapshotName)
        
        if (params.operation === 'cleanup') {
            // Cleanup mode: just return empty to let Pulumi destroy existing resources
            return { newVolumeId: pulumi.output('') }
        }
        
        // Create mode: create the volume
        const snap = await scw.block.getSnapshot({ name: computeSnapshotResourceName(params.stack, params.snapshotName) })
        const vol = new scw.block.Volume(volName, { 
            name: volName, 
            iops: params.iops ?? SCALEWAY_STORAGE.DEFAULT_VOLUME_IOPS, 
            snapshotId: snap.id, 
            tags: [
                SCALEWAY_STORAGE.CLOUDYPAD_TAGS.CLOUDYPAD, 
                `${SCALEWAY_STORAGE.CLOUDYPAD_TAGS.STACK_PREFIX}${params.stack}`, 
                SCALEWAY_STORAGE.CLOUDYPAD_TAGS.DATA_DISK, 
                `${SCALEWAY_STORAGE.CLOUDYPAD_TAGS.RESTORED_FROM_PREFIX}${params.snapshotName}`,
                `operation:${params.operation}`,
                `created:${new Date().toISOString()}`
            ]
        }, {
            // Add custom timeouts for volume operations to prevent the 5-minute timeout error
            customTimeouts: {
                create: `${SCALEWAY_TIMEOUTS.PULUMI_VOLUME_DELETE_TIMEOUT}s`,
                delete: `${SCALEWAY_TIMEOUTS.PULUMI_VOLUME_DELETE_TIMEOUT}s`,
                update: `${SCALEWAY_TIMEOUTS.PULUMI_VOLUME_DELETE_TIMEOUT}s`
            }
        })
        return { newVolumeId: vol.id }
    }
}

// Backward compatibility: keep the old function for existing code
function programCreateVolumeFromSnapshot(params: { stack: string, snapshotName: string, iops?: number }){
    return programCreateVolumeFromSnapshotPersistent({ ...params, operation: 'create' })
}

class RestoreVolumeClient extends InstancePulumiClient<{ projectId: string, region: string, zone: string }, { newVolumeId: string }>{
    protected async doSetConfig(config: { projectId: string, region: string, zone: string }): Promise<void> {
        // Access protected method through proper inheritance
        const stack = await this.getStack() // TODO: Improve base class API
        await stack.setConfig("scaleway:project_id", { value: config.projectId })
        await stack.setConfig("scaleway:region", { value: config.region })
        await stack.setConfig("scaleway:zone", { value: config.zone })
    }
    protected async buildTypedOutput(outputs: Record<string, { value: unknown }>): Promise<{ newVolumeId: string }> {
        const newVolumeIdValue = outputs['newVolumeId']?.value
        if (typeof newVolumeIdValue !== 'string') {
            throw new Error(`Expected string volume ID, got ${typeof newVolumeIdValue}`)
        }
        return { newVolumeId: newVolumeIdValue }
    }
}

export async function restoreDataDiskSnapshot(
    args: RestoreSnapshotArgs
): Promise<RestoreSnapshotResult> {
    // Validate input parameters
    validateSnapshotName(args.snapshotName)
    if (!args.instanceServerId.trim()) {
        throw new Error('Instance server ID cannot be empty')
    }
    if (!args.host.trim()) {
        throw new Error('Host cannot be empty')
    }
    
    // Zero-orphan approach: Use declarative state management
    return await performZeroOrphanRestore(args)
}

/**
 * Zero-orphan restore implementation
 * Key principle: Never create intermediate states that can become orphaned
 */
async function performZeroOrphanRestore(args: RestoreSnapshotArgs): Promise<RestoreSnapshotResult> {
    const logger = getLogger('zero-orphan-restore')
    
    // 1. Determine desired IOPS for the new volume (preserve from old disk if possible)
    let desiredIops: number | undefined = undefined
    try {
        const client = createClient({ ...loadProfileFromConfigurationFile(), defaultZone: args.zone })
        const scwBlock = new Block.v1alpha1.API(client)
        if (args.oldDataDiskId) {
            const volInfo = await scwBlock.getVolume({ volumeId: args.oldDataDiskId })
            if (ScalewayTypeGuards.volumeWithIOPS(volInfo)) {
                desiredIops = volInfo.specs?.perfIops
                if (desiredIops) logger.debug(`Preserving original data disk perfIops=${desiredIops}`)
            }
        }
    } catch (e) {
        const errorMsg = e instanceof Error ? e.message : String(e)
        logger.warn(`Could not detect original data disk IOPS; using default. ${errorMsg}`)
    }
    
    // 2. Use persistent stack with declarative approach
    // Key: Stack name is deterministic (instanceName), not random/temporary
    const persistentStack = new RestoreVolumeClient({
        program: programCreateVolumeFromSnapshot({ 
            stack: args.instanceName, 
            snapshotName: args.snapshotName, 
            iops: desiredIops 
        }),
        projectName: 'CloudyPad-Scaleway-RestoreVolume',
        stackName: args.instanceName, // ← Persistent, not temporary
    })
    
    await persistentStack.setConfig({ 
        projectId: args.projectId, 
        region: args.zone.split('-').slice(0, SCALEWAY_API.REGION_ZONE_SPLIT_INDEX).join('-'), 
        zone: args.zone 
    })
    
    // 3. Atomic transition to desired state
    // Pulumi handles: create new volume from snapshot
    // If this fails, no partial state is left behind
    const volOut = await persistentStack.up()
    const newVolumeIdFull = volOut.newVolumeId
    const newVolumeId = normalizeVolumeId(newVolumeIdFull)
    
    if (!newVolumeId) {
        throw new Error(`Invalid volume ID format: ${newVolumeIdFull}`)
    }
    
    // 4. Instance operations (stop, detach old, attach new, start)
    const scwClient = new ScalewayClient('scw-attach', { projectId: args.projectId, zone: args.zone })
    const instanceOps = new ScalewayInstanceOperations(scwClient)
    const volumeOps = new ScalewayVolumeOperations(scwClient)
    
    // Stop instance for safe volume operations
    await scwClient.stopInstance(args.instanceServerId, { 
        wait: true, 
        waitTimeoutSeconds: SCALEWAY_TIMEOUTS.INSTANCE_OPERATION_TIMEOUT 
    })
    
    // Detach old volume if present
    if (args.oldDataDiskId) {
        await volumeOps.safeDetachVolume(args.instanceServerId, args.oldDataDiskId, 'old')
    }
    
    // Attach new volume
    await scwClient.attachDataVolume(args.instanceServerId, newVolumeId)
    
    // Start instance
    await instanceOps.safeStartInstance(args.instanceServerId, 'after volume restore')
    
    // 5. Configure only data-disk via Ansible (minimal configuration)
    await configureDataDiskOnly({
        host: args.host,
        dataDiskId: newVolumeId,
        ssh: args.ssh,
        instanceName: args.instanceName,
        zone: args.zone
    })
    
    // 6. Delete old volume if requested
    if (args.deleteOldDisk && args.oldDataDiskId) {
        try {
            await volumeOps.deleteVolumeWithRetry(args.oldDataDiskId, 'after successful restore')
        } catch (e) {
            logger.warn(`Failed to delete old volume ${args.oldDataDiskId}:`, e)
        }
    }
    
    // 7. Delete snapshot if requested
    if (args.deleteSnapshot) {
        try {
            const client = createClient({ ...loadProfileFromConfigurationFile(), defaultZone: args.zone })
            const scwBlock = new Block.v1alpha1.API(client)
            
            // Find snapshot by name
            const snapshotResourceName = computeSnapshotResourceName(args.instanceName, args.snapshotName)
            const snapshots = await scwBlock.listSnapshots({ name: snapshotResourceName })
            
            if (snapshots.snapshots && snapshots.snapshots.length > 0) {
                const snapshot = snapshots.snapshots[0]
                await scwBlock.deleteSnapshot({ snapshotId: snapshot.id })
                logger.info(`Deleted snapshot '${args.snapshotName}' (${snapshot.id}) after successful restore`)
            } else {
                logger.warn(`Snapshot '${snapshotResourceName}' not found for deletion`)
            }
        } catch (e) {
            logger.warn(`Failed to delete snapshot '${args.snapshotName}':`, e)
        }
    }
    
    // Note: Stack remains persistent for future operations
    // No cleanup needed - stack represents current desired state
    
    return { newDataDiskId: newVolumeId }
}

// performRestoreOperation removed - replaced by performZeroOrphanRestore
export async function diagnosePulumiIssues(instanceName: string): Promise<{
    issues: string[]
    recommendations: string[]
    autoFixApplied: boolean
}> {
    const logger = getLogger('pulumi-diagnostic')
    const stackManager = new PulumiStackManager()
    const issues: string[] = []
    const recommendations: string[] = []
    let autoFixApplied = false
    
    try {
        const pulumiBackendPath = `${process.env.HOME}/.cloudypad/pulumi-backend/.pulumi`
        
        // Check for orphaned locks
        const lockFiles = await stackManager.findFiles(`${pulumiBackendPath}/locks/organization/CloudyPad-Scaleway-*/${instanceName}/*.json`)
        if (lockFiles.length > 0) {
            issues.push(`Found ${lockFiles.length} orphaned lock files`)
            recommendations.push('Run cleanup to remove stale locks')
        }
        
        // Check for problematic stacks
        const stacks = [
            'CloudyPad-Scaleway-RestoreVolume',
            'CloudyPad-Scaleway-Snapshot'
        ]
        
        for (const projectName of stacks) {
            const stackPath = `${pulumiBackendPath}/stacks/${projectName}/${instanceName}.json`
            const exists = await stackManager.fileExists(stackPath)
            if (exists) {
                issues.push(`Found potentially problematic stack: ${projectName}/${instanceName}`)
                recommendations.push(`Consider cleaning up stack: ${projectName}/${instanceName}`)
            }
        }
        
        // Auto-fix: Clean up orphaned locks
        if (lockFiles.length > 0) {
            try {
                await stackManager.cleanupOrphanedStack('CloudyPad-Scaleway-RestoreVolume', instanceName)
                await stackManager.cleanupOrphanedStack('CloudyPad-Scaleway-Snapshot', instanceName)
                autoFixApplied = true
                logger.info('Auto-cleaned orphaned Pulumi locks')
            } catch (e) {
                logger.warn('Auto-fix failed', e)
            }
        }
        
    } catch (e) {
        issues.push(`Diagnostic failed: ${e instanceof Error ? e.message : String(e)}`)
    }
    
    return { issues, recommendations, autoFixApplied }
}

/**
 * Execute only the data-disk Ansible role for snapshot restore
 * This mounts the restored disk without full system configuration
 */
async function configureDataDiskOnly(args: {
    host: string
    dataDiskId: string
    ssh: InstanceStateV1['provision']['input']['ssh']
    instanceName: string
    zone: string
}): Promise<void> {
    const logger = getLogger('configure-data-disk-only')
    
    // Use the existing AnsibleConfigurator but with minimal config for data-disk only
    const { AnsibleConfigurator } = await import('../../configurators/ansible')
    
    // Create fake provision structures that Ansible expects
    const fakeProvisionInput = { 
        ssh: { ...args.ssh }
    } as unknown as InstanceStateV1['provision']['input']
    
    const fakeProvisionOutput = { 
        host: args.host, 
        publicIPv4: args.host,
        dataDiskId: args.dataDiskId 
    } as NonNullable<InstanceStateV1['provision']['output']>
    
    // Configuration that enables data-disk and minimal Sunshine (but we'll only run data-disk tag)
    const configInput = { 
        enableDataDisk: true,
        sunshine: { 
            enable: true,  // Minimal activation just to pass validation, won't run due to -t data-disk
            passwordBase64: 'ZHVtbXk=', // dummy base64 value (won't be used)
            username: 'dummy' // dummy username (won't be used)
        }
    }
    
    try {
        const ansibleConfigurator = new AnsibleConfigurator({
            instanceName: args.instanceName,
            provider: 'scaleway',
            provisionInput: fakeProvisionInput,
            provisionOutput: fakeProvisionOutput,
            configurationInput: configInput,
            additionalAnsibleArgs: ['-t', 'data-disk']  // Only run data-disk tag
        })
        
        logger.info(`Configuring data disk via Ansible (data-disk role only)...`)
        await ansibleConfigurator.configure()
        logger.info('Data disk configuration completed successfully')
        
    } catch (error) {
        logger.error('Failed to configure data disk via Ansible:', error)
        // Don't throw - just warn, as the volume is still attached
        logger.warn('Data disk is attached but may not be mounted. Manual mount may be required.')
    }
}


