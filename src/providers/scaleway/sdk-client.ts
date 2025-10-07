import { getLogger, Logger } from '../../log/utils'
import { createClient, Instance, Vpc, Account, Marketplace, Profile, Block } from '@scaleway/sdk'
import { loadProfileFromConfigurationFile } from '@scaleway/configuration-loader'
import { ScalewayErrorUtils } from '../../tools/scaleway-error-utils'
import { SCALEWAY_STORAGE, SCALEWAY_TIMEOUTS } from './constants'
import { ScalewayTypeGuards } from './type-guards'
import type { ScalewayClientArgs } from './types/branded'
import { 
  validateScalewayClientArgs, 
  getDefaultValidationConfig, 
  consoleValidationLogger,
  getLatestSchemaVersion,
  type ScalewayClientRawArgs
} from './validation'
import type { ExtendedValidationConfig } from './validation/schemas'

// Use centralized volume type constants
type ScalewayVolumeTypeForInstance = typeof SCALEWAY_STORAGE.VOLUME_TYPES[keyof typeof SCALEWAY_STORAGE.VOLUME_TYPES]



interface StartStopActionOpts {
    wait?: boolean
    waitTimeoutSeconds?: number
}

export interface ScalewayVMDetails {
    commercialType: string
    name: string
    state: string
    tags?: string[]
    id: string
}

const DEFAULT_START_STOP_OPTION_WAIT=false

// Generous default timeout as G instances are sometime long to stop
const DEFAULT_START_STOP_OPTION_WAIT_TIMEOUT=60

// Use centralized volume type constants

// Based on ServerState from '@scaleway/sdk/dist/api/instance/v1/types.gen'
export enum ScalewayServerState {
    Starting = "starting",
    Running = "running",
    Stopped = "stopped",
    Stopping = "stopping",
    StoppedInPlace = "stopped in place",
    Locked = "locked",
    Unknown = "unknown"
}

// Based on ServerAction from '@scaleway/sdk/dist/api/instance/v1/types.gen'
export enum ServerActionEnum {
    PowerOn = 'poweron',
    Backup = 'backup',
    StopInPlace = 'stop_in_place',
    PowerOff = 'poweroff',
    Terminate = 'terminate',
    Reboot = 'reboot',
    EnableRoutedIp = 'enable_routed_ip'
}

// ScalewayClientArgs is now exported from ./types/branded.ts

export interface ScalewayInstanceType {
    name: string
    gpu: number
    ramGb: number
    cpu: number
}

export class ScalewayClient {


    /**
     * List available regions for Scaleway.
     * 
     * @returns List of available regions
     */
    static listRegions(): string[] {
        // Use VPC data as our instances are using VPC
        return Vpc.v2.API.LOCALITIES
    }

    /**
     * List available zones for Scaleway.
     * 
     * @returns List of available zones
     */
    static listZones(): string[] {
        // Use Instance data as we're gonna use instances
        return Instance.v1.API.LOCALITIES
    }

    /**
     * Verify local Scaleway configuration is valid. Throws an error with reason if not.
     */
    static checkLocalConfig(): void {
        try {
            ScalewayClient.loadProfileFromConfigurationFile()
        } catch (error) {
            throw ScalewayErrorUtils.createScalewayError(
                "Scaleway configuration is not valid. Did you configure your Scaleway credentials? " +
                "See https://docs.cloudypad.gg/cloud-provider-setup/scaleway.html. Error: " + ScalewayErrorUtils.extractErrorMessage(error),
                error
            )
        }
    }

    /**
     * Load Scaleway profile from configuration file.
     * Mocked for unit tests
     * @returns Scaleway profile
     */
    static loadProfileFromConfigurationFile(): Profile {
        return loadProfileFromConfigurationFile()
    }

    private readonly logger: Logger
    private readonly instanceClient: Instance.v1.API
    private readonly blockClient: Block.v1alpha1.API
    private readonly accountProjectClient: Account.v3.ProjectAPI
    private readonly marketplaceClient: Marketplace.v2.API

    // Overload 1: Branded types (recommended)
    constructor(name: string, args: ScalewayClientArgs, validationConfig?: ExtendedValidationConfig)
    // Overload 2: Raw strings (compatibility - validation at boundary)
    constructor(name: string, args: ScalewayClientRawArgs, validationConfig?: ExtendedValidationConfig)
    // Implementation
    constructor(name: string, args: ScalewayClientArgs | ScalewayClientRawArgs, validationConfig?: ExtendedValidationConfig) {
        const profile = ScalewayClient.loadProfileFromConfigurationFile()
        
        // Validation and conversion at boundary using production-ready validation
        const config = validationConfig || {
            ...getDefaultValidationConfig(),
            schemaVersion: getLatestSchemaVersion(),
            enableAutoMigration: true,
            logger: process.env.NODE_ENV === 'development' ? consoleValidationLogger : undefined
        }
        const safeArgs = validateScalewayClientArgs(args, config)
        
        const client = createClient({
            ...profile,
            defaultProjectId: safeArgs.projectId as string, // Safe cast after validation
            defaultZone: safeArgs.zone as string,
            defaultRegion: safeArgs.region as string,
        })
        this.logger = getLogger(name)
        this.instanceClient = new Instance.v1.API(client)
        this.blockClient = new Block.v1alpha1.API(client)
        this.accountProjectClient = new Account.v3.ProjectAPI(client)
        this.marketplaceClient = new Marketplace.v2.API(client)
    }



    async listInstances(): Promise<ScalewayVMDetails[]> {
        this.logger.debug(`Listing Scaleway virtual machines`)

        const vms = []
        const servers = await this.instanceClient.listServers()
        for (const server of servers.servers) {
            vms.push({
                commercialType: server.commercialType,
                name: server.name,
                state: server.state,
                tags: server.tags,
                id: server.id
            })
        }

        this.logger.debug(`List virtual machines response: ${JSON.stringify(vms)}`)

        return vms
    }

    async startInstance(serverId: string, opts?: StartStopActionOpts) {
        const wait = opts?.wait ?? DEFAULT_START_STOP_OPTION_WAIT
        const waitTimeout = opts?.waitTimeoutSeconds || DEFAULT_START_STOP_OPTION_WAIT_TIMEOUT

        try {
            const current = await this.getInstanceStatus(serverId)
            if (current === ScalewayServerState.Running || current === ScalewayServerState.Starting) {
                this.logger.debug(`VM ${serverId} already ${current}, skipping power on`)
                if (wait) {
                    await this.withTimeout(this.waitForStatus(serverId, ScalewayServerState.Running), waitTimeout * 1000)
                }
                return
            }

            this.logger.debug(`Starting Scaleway virtual machine: ${serverId}`)
            try {
                await this.instanceClient.serverAction({ serverId, action: ServerActionEnum.PowerOn })
            } catch (e: unknown) {
                const msg = ScalewayErrorUtils.extractErrorMessage(e)
                if (msg.includes('resource_not_usable') || msg.includes('All volumes attached to the server must be available')) {
                    this.logger.warn(`Server ${serverId} not startable yet (volumes not usable). Waiting for attached volumes to be in_use...`)
                    await this.waitForAllVolumesUsable(serverId, SCALEWAY_TIMEOUTS.VOLUME_USABLE_WAIT_TIMEOUT)
                    // single retry
                    await this.instanceClient.serverAction({ serverId, action: ServerActionEnum.PowerOn })
                } else {
                    throw e
                }
            }

            if (wait) {
                this.logger.debug(`Waiting for virtual machine ${serverId} to start`)
                await this.withTimeout(this.waitForStatus(serverId, ScalewayServerState.Running), waitTimeout * 1000)
            }
        } catch (error) {
            throw ScalewayErrorUtils.createScalewayError(`Failed to start virtual machine ${serverId}. Error: ${ScalewayErrorUtils.extractErrorMessage(error)}`, error)
        }
    }

    async stopInstance(serverId: string, opts?: StartStopActionOpts) {
        const wait = opts?.wait ?? DEFAULT_START_STOP_OPTION_WAIT
        const waitTimeout = opts?.waitTimeoutSeconds || DEFAULT_START_STOP_OPTION_WAIT_TIMEOUT

        try {
            const current = await this.getInstanceStatus(serverId)
            if (current === ScalewayServerState.Stopped || current === ScalewayServerState.Stopping) {
                this.logger.debug(`VM ${serverId} already ${current}, skipping power off`)
                if (wait) {
                    await this.withTimeout(this.waitForStatus(serverId, ScalewayServerState.Stopped), waitTimeout * 1000)
                }
                return
            }

            this.logger.debug(`Stopping Scaleway virtual machine: ${serverId}`)
            await this.instanceClient.serverAction({ serverId, action: ServerActionEnum.PowerOff })

            if (wait) {
                this.logger.debug(`Waiting for virtual machine ${serverId} to stop`)
                await this.withTimeout(this.waitForStatus(serverId, ScalewayServerState.Stopped), waitTimeout * 1000)
            }

        } catch (error) {
            throw ScalewayErrorUtils.createScalewayError(`Failed to stop virtual machine ${serverId}. Error: ${ScalewayErrorUtils.extractErrorMessage(error)}`, error)
        }
    }

    async restartInstance(serverId: string, opts?: StartStopActionOpts) {
        const wait = opts?.wait ?? DEFAULT_START_STOP_OPTION_WAIT
        const waitTimeout = opts?.waitTimeoutSeconds || DEFAULT_START_STOP_OPTION_WAIT_TIMEOUT

        try {
            this.logger.debug(`Restarting Scaleway virtual machine: ${serverId}`)
            await this.instanceClient.serverAction({ serverId, action: ServerActionEnum.Reboot })

            if (wait) {
                this.logger.debug(`Waiting for virtual machine ${serverId} to restart`)
                await this.withTimeout(this.waitForStatus(serverId, ScalewayServerState.Running), waitTimeout * 1000)
            }

        } catch (error) {
            throw ScalewayErrorUtils.createScalewayError(`Failed to restart virtual machine ${serverId}. Error: ${ScalewayErrorUtils.extractErrorMessage(error)}`, error)
        }
    }

    private normalizeUuid(id: string | undefined): string | undefined {
        if (!id) return undefined
        if (id.includes('/')) {
            const parts = id.split('/')
            const lastPart = parts[parts.length - 1]
            if (!lastPart) {
                throw ScalewayErrorUtils.createInvalidUUIDError(id)
            }
            return lastPart
        }
        return id
    }

    async detachDataVolume(serverId: string, blockVolumeId: string): Promise<void> {
        const volumeId = this.normalizeUuid(blockVolumeId)
        if (!volumeId) {
            throw ScalewayErrorUtils.createInvalidUUIDError(blockVolumeId, 'volume ID')
        }
        this.logger.debug(`Detaching block volume ${volumeId} from server ${serverId}`)
        // Use official SDK method
        await (this.instanceClient as unknown as { detachServerVolume: (args: { serverId: string; volumeId: string }) => Promise<unknown> }).detachServerVolume({ serverId, volumeId })
        // Best-effort wait until detached (Block API status not 'in_use') to avoid transient in_use on deletion
        const timeoutMs = 60_000
        const start = Date.now()
        while (true) {
            try {
                const vol = await (this.blockClient as unknown as { getVolume: (args: { volumeId: string }) => Promise<unknown> }).getVolume({ volumeId })
                if (ScalewayTypeGuards.volumeStatus(vol) && vol.status !== 'in_use') break
            } catch {
                // ignore lookup errors transiently
                break
            }
            if (Date.now() - start > timeoutMs) {
                this.logger.warn(`Timeout waiting for volume ${volumeId} to detach from server ${serverId}; proceeding anyway`)
                break
            }
            await new Promise(r => setTimeout(r, 2000))
        }
    }

    async attachDataVolume(serverId: string, volumeId: string): Promise<void> {
        const volId = this.normalizeUuid(volumeId)
        if (!volId) {
            throw ScalewayErrorUtils.createInvalidUUIDError(volumeId, 'volume ID')
        }
        this.logger.debug(`Attaching block volume ${volId} to server ${serverId}`)
        // Determine required instance volumeType based on Block Storage class
        let volumeTypeForInstance: ScalewayVolumeTypeForInstance = SCALEWAY_STORAGE.VOLUME_TYPES.BLOCK_SSD
        try {
            const vol = await (this.blockClient as unknown as { getVolume: (args: { volumeId: string }) => Promise<unknown> }).getVolume({ volumeId: volId })
            let klass: string | undefined
            if (ScalewayTypeGuards.volumeSpecs(vol)) {
                klass = vol.specs.class
            }
            if (klass === 'sbs') {
                volumeTypeForInstance = SCALEWAY_STORAGE.VOLUME_TYPES.SBS_VOLUME
            } else {
                volumeTypeForInstance = SCALEWAY_STORAGE.VOLUME_TYPES.BLOCK_SSD
            }
            this.logger.debug(`Detected block volume class '${klass ?? 'unknown'}' -> instance volume_type '${volumeTypeForInstance}'`)
        } catch (e) {
            const errorMsg = ScalewayErrorUtils.extractErrorMessage(e)
            this.logger.warn(`Could not detect block volume class for ${volId}; defaulting to '${SCALEWAY_STORAGE.VOLUME_TYPES.BLOCK_SSD}'. ${errorMsg}`)
        }
        const client = this.instanceClient as unknown as { attachServerVolume: (args: { serverId: string; volumeId: string; volumeType: 'b_ssd' | 'sbs_volume' }) => Promise<unknown> }
        await client.attachServerVolume({ serverId, volumeId: volId, volumeType: volumeTypeForInstance })
        // Wait until volume shows as in_use before attempting to start the server
        const timeoutMs = SCALEWAY_TIMEOUTS.VOLUME_ATTACH_TIMEOUT
        const start = Date.now()
        while (true) {
            try {
                const vol = await (this.blockClient as unknown as { getVolume: (args: { volumeId: string }) => Promise<unknown> }).getVolume({ volumeId: volId })
                if (ScalewayTypeGuards.volumeStatus(vol) && vol.status === 'in_use') break
            } catch {
                // ignore transient lookup errors
            }
            if (Date.now() - start > timeoutMs) {
                this.logger.warn(`Timeout waiting for volume ${volId} to attach to server ${serverId}; proceeding anyway`)
                break
            }
            await new Promise(r => setTimeout(r, 2000))
        }
    }

    async deleteBlockSnapshotByName(name: string): Promise<void> {
        this.logger.debug(`Deleting block snapshot with name ${name}`)
        const snaps = await this.blockClient.listSnapshots()
        const snap = snaps.snapshots?.find(s => s.name === name)
        if(!snap?.id) return
        await this.blockClient.deleteSnapshot({ snapshotId: snap.id })
    }

    async deleteBlockVolume(volumeId: string): Promise<void> {
        this.logger.debug(`Deleting block volume ${volumeId}`)
        await this.blockClient.deleteVolume({ volumeId })
    }

    async getRawServerData(serverId: string): Promise<Instance.v1.Server | undefined> {
        const server = await this.instanceClient.getServer({ serverId })
        return server.server
    }

    /**
     * Try to discover the currently attached data disk ID on a server by inspecting its volumes
     * and returning the first volume that is not the root volume.
     */
    async findCurrentDataDiskId(serverId: string): Promise<string | undefined> {
        const srv = await this.getRawServerData(serverId)
        if (!srv) return undefined
        
        // Normalize helpers
        const normalize = (id?: string) => (id ? (id.includes('/') ? id.split('/').pop()! : id) : undefined)
        
        // Type-safe server data access
        const serverData = srv as unknown as { 
            volumes?: Record<string, { id?: string; volumeId?: string }> 
            rootVolume?: { volumeId?: string }
            additionalVolumes?: Record<string, { id?: string; volumeId?: string }>
        }
        
        const volumesObj = serverData.volumes || {}
        
        // Determine root volume id: prefer explicit key '0' in volumes map, else fallback to rootVolume.volumeId
        const rootFromMap = volumesObj['0'] ? normalize(volumesObj['0']?.id || volumesObj['0']?.volumeId) : undefined
        const rootFromField = normalize(serverData.rootVolume?.volumeId)
        const rootVolId = rootFromMap || rootFromField
        
        // Prefer a non-root position in volumes map
        const entries = Object.entries(volumesObj)
        
        // First try the common position '1'
        const pos1 = entries.find(([k]) => k !== '0')
        if (pos1) {
            const vid = normalize(pos1[1]?.id || pos1[1]?.volumeId)
            if (vid && vid !== rootVolId) return vid
        }
        
        // Then try any other non-root positions
        for (const [k, v] of entries) {
            if (k === '0') continue
            const vid = normalize(v?.id || v?.volumeId)
            if (vid && vid !== rootVolId) return vid
        }
        
        // Some API variants expose additionalVolumes
        const addlObj = serverData.additionalVolumes || {}
        for (const v of Object.values(addlObj)) {
            const vid = normalize(v?.id || v?.volumeId)
            if (vid && vid !== rootVolId) return vid
        }
        
        return undefined
    }

    async getInstanceStatus(serverId: string): Promise<ScalewayServerState | undefined> {
        this.logger.debug(`Getting Scaleway virtual machine state: ${serverId}`)

        try  {
            const server = await this.instanceClient.getServer({ serverId })

            if (!server.server) {
                throw ScalewayErrorUtils.createScalewayError(`Server with id ${serverId} not found while getting status`)
            }

            this.logger.debug(`Found Scaleway virtual machine state: ${server.server.state}`)

            switch(server.server.state){
                case 'running':
                    return ScalewayServerState.Running
                case 'stopped':
                    return ScalewayServerState.Stopped
                case 'starting':
                    return ScalewayServerState.Starting
                case 'stopping':
                    return ScalewayServerState.Stopping
                default:
                    return ScalewayServerState.Unknown
            }

        } catch (error) {
            throw ScalewayErrorUtils.createScalewayError(`Failed to get Scaleway virtual machine status: ${serverId}. Error: ${ScalewayErrorUtils.extractErrorMessage(error)}`, error)
        }
    }

    async listProjects(): Promise<{ name: string, id: string }[]> {
        const projects = await this.accountProjectClient.listProjects()
        return projects.projects.map(p => ({ name: p.name, id: p.id }))
    }

    async listInstanceImages(): Promise<{ name: string, id: string }[]> {
        const images = await this.marketplaceClient.listImages({
            arch: "x86_64",
            includeEol: false,
        })
        return images.images.map(i => ({ name: i.name, id: i.id }))
    }

    /**
     * List available server types with GPU.
     * 
     * @param gpuCount Exact number of GPUs to filter on
     * @returns List of available server types with GPU
     */
    async listGpuInstanceTypes(gpuCount?: number): Promise<ScalewayInstanceType[]> {
        const types = await this.instanceClient.listServersTypes()

        const gpuServerTypes: ScalewayInstanceType[] = []
        for(const [ name, type ] of Object.entries(types.servers)){
            if(type.gpu && type.gpu > 0){
                if(gpuCount && type.gpu !== gpuCount){
                    continue
                }
                gpuServerTypes.push({
                    name: name,
                    gpu: type.gpu,
                    ramGb: Math.round(type.ram / (1024 * 1024 * 1024)),
                    cpu: type.ncpus
                })
            }
        }

        return gpuServerTypes
    }

    private async waitForStatus(serverId: string, status: ScalewayServerState): Promise<void> {
        while (true) {
            const currentStatus = await this.getInstanceStatus(serverId)
            if (currentStatus === status) {
                return
            }
            await new Promise(resolve => setTimeout(resolve, 5000))
        }
    }

    private async waitForAllVolumesUsable(serverId: string, timeoutMs: number): Promise<void> {
        const start = Date.now()
        while (true) {
            try {
                const server = await this.instanceClient.getServer({ serverId })
                const vols = (server as unknown as { server?: { volumes?: Record<string, { volume?: { id?: string } }> } }).server?.volumes
                const volIds = vols ? Object.values(vols).map(v => (v.volume?.id ? this.normalizeUuid(v.volume.id) : undefined)).filter(Boolean) as string[] : []
                if (volIds.length === 0) return
                let allInUse = true
                for (const vid of volIds) {
                    try {
                        const vol = await (this.blockClient as unknown as { getVolume: (args: { volumeId: string }) => Promise<{ status?: string }> }).getVolume({ volumeId: vid })
                        if (!vol || vol.status !== 'in_use') {
                            allInUse = false
                            break
                        }
                    } catch {
                        allInUse = false
                        break
                    }
                }
                if (allInUse) return
            } catch {
                // ignore transient errors
            }
            if (Date.now() - start > timeoutMs) return
            await new Promise(r => setTimeout(r, 2000))
        }
    }

    private async withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
        if (!timeoutMs) {
            return promise
        }
    
        return new Promise<T>((resolve, reject) => {
            const timeoutId = setTimeout(() => {
                reject(ScalewayErrorUtils.createScalewayError(`Operation timed out after ${timeoutMs} ms`))
            }, timeoutMs)
    
            promise
                .then((result) => {
                    clearTimeout(timeoutId)
                    resolve(result)
                })
                .catch((error) => {
                    clearTimeout(timeoutId)
                    reject(error)
                })
        })
    }
    
}
