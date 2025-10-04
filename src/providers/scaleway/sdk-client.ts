import { getLogger, Logger } from '../../log/utils'
import { createClient, Instance, Vpc, Account, Marketplace, Profile, Block } from '@scaleway/sdk'
import { loadProfileFromConfigurationFile } from '@scaleway/configuration-loader'

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

/**
 * Available volume types for Scaleway instances.
 * 
 * Local volumes: The local volume of an Instance is an all-SSD-based storage solution, 
 * using a RAID array for redundancy and performance, hosted on the local hypervisor. 
 * On Scaleway Instances, the size of the local volume is fixed and depends on the Instance type. 
 * Some Instance types do not use local volumes and boot directly on block volumes.
 * 
 * Block volumes: Block volumes provide network-attached storage you can plug in and out of Instances like a virtual hard drive. 
 * Block volumes behave like regular disks and can be used to increase the storage of an Instance
 * 
 * See https://www.scaleway.com/en/docs/instances/concepts/#local-volumes
 */
export enum ScalewayVolumeType {
    BLOCK_SSD = "b_ssd",
    LOCAL_SSD = "l_ssd",
}

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

export interface ScalewayClientArgs {
    organizationId?: string
    projectId?: string
    zone?: string
    region?: string
}

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
            throw new Error("Scaleway configuration is not valid. Did you configure your Scaleway credentials? "
                +  "See https://docs.cloudypad.gg/cloud-provider-setup/scaleway.html.",
                { cause: error }
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

    constructor(name: string, args: ScalewayClientArgs) {
        const profile = ScalewayClient.loadProfileFromConfigurationFile()
        const client = createClient({
            ...profile,
            defaultProjectId: args.projectId,
            defaultZone: args.zone,
            defaultRegion: args.region,
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
                const msg = String((e as Error).message || e)
                if (msg.includes('resource_not_usable') || msg.includes('All volumes attached to the server must be available')) {
                    this.logger.warn(`Server ${serverId} not startable yet (volumes not usable). Waiting for attached volumes to be in_use...`)
                    await this.waitForAllVolumesUsable(serverId, 120_000)
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
            throw new Error(`Failed to start virtual machine ${serverId}`, { cause: error })
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
            throw new Error(`Failed to stop virtual machine ${serverId}`, { cause: error })
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
            throw new Error(`Failed to restart virtual machine ${serverId}`, { cause: error })
        }
    }

    private normalizeUuid(id: string | undefined): string | undefined {
        if (!id) return undefined
        return id.includes('/') ? (id.split('/').pop() as string) : id
    }

    async detachDataVolume(serverId: string, blockVolumeId: string): Promise<void> {
        const volumeId = this.normalizeUuid(blockVolumeId) as string
        this.logger.debug(`Detaching block volume ${volumeId} from server ${serverId}`)
        // Use official SDK method
        await (this.instanceClient as unknown as { detachServerVolume: (args: { serverId: string; volumeId: string }) => Promise<unknown> }).detachServerVolume({ serverId, volumeId })
        // Best-effort wait until detached (Block API status not 'in_use') to avoid transient in_use on deletion
        const timeoutMs = 60_000
        const start = Date.now()
        while (true) {
            try {
                const vol = await (this.blockClient as unknown as { getVolume: (args: { volumeId: string }) => Promise<{ status?: string }> }).getVolume({ volumeId })
                if (vol && vol.status && vol.status !== 'in_use') break
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
        const volId = this.normalizeUuid(volumeId) as string
        this.logger.debug(`Attaching block volume ${volId} to server ${serverId}`)
        // Determine required instance volumeType based on Block Storage class
        let volumeTypeForInstance: 'b_ssd' | 'sbs_volume' = ScalewayVolumeType.BLOCK_SSD as unknown as 'b_ssd'
        try {
            const vol = await (this.blockClient as unknown as { getVolume: (args: { volumeId: string }) => Promise<{ specs?: { class?: string } }> }).getVolume({ volumeId: volId })
            const klass = vol?.specs?.class
            if (klass === 'sbs') {
                volumeTypeForInstance = 'sbs_volume'
            } else {
                volumeTypeForInstance = 'b_ssd'
            }
            this.logger.debug(`Detected block volume class '${klass ?? 'unknown'}' -> instance volume_type '${volumeTypeForInstance}'`)
        } catch (e) {
            this.logger.warn(`Could not detect block volume class for ${volId}; defaulting to 'b_ssd'. ${(e as Error).message}`)
        }
        const client = this.instanceClient as unknown as { attachServerVolume: (args: { serverId: string; volumeId: string; volumeType: 'b_ssd' | 'sbs_volume' }) => Promise<unknown> }
        await client.attachServerVolume({ serverId, volumeId: volId, volumeType: volumeTypeForInstance })
        // Wait until volume shows as in_use before attempting to start the server
        const timeoutMs = 60_000
        const start = Date.now()
        while (true) {
            try {
                const vol = await (this.blockClient as unknown as { getVolume: (args: { volumeId: string }) => Promise<{ status?: string }> }).getVolume({ volumeId: volId })
                if (vol && vol.status === 'in_use') break
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
        const normalize = (id?: string) => (id ? (id.includes('/') ? id.split('/').pop() as string : id) : undefined)
        const volumesObj = (srv as unknown as { volumes?: Record<string, { id?: string; volumeId?: string }> }).volumes || {}
        // Determine root volume id: prefer explicit key '0' in volumes map, else fallback to rootVolume.volumeId
        const rootFromMap = volumesObj['0'] ? normalize(volumesObj['0'].id || volumesObj['0'].volumeId) : undefined
        const rootFromField = normalize((srv as unknown as { rootVolume?: { volumeId?: string } }).rootVolume?.volumeId)
        const rootVolId = rootFromMap || rootFromField
        // Prefer a non-root position in volumes map
        const entries = Object.entries(volumesObj)
        // First try the common position '1'
        const pos1 = entries.find(([k]) => k !== '0')
        if (pos1) {
            const vid = normalize(pos1[1].id || pos1[1].volumeId)
            if (vid && vid !== rootVolId) return vid
        }
        // Then try any other non-root positions
        for (const [k, v] of entries) {
            if (k === '0') continue
            const vid = normalize(v.id || v.volumeId)
            if (vid && vid !== rootVolId) return vid
        }
        // Some API variants expose additionalVolumes
        const addlObj = (srv as unknown as { additionalVolumes?: Record<string, { id?: string; volumeId?: string }> }).additionalVolumes || {}
        for (const v of Object.values(addlObj)) {
            const vid = normalize(v.id || v.volumeId)
            if (vid && vid !== rootVolId) return vid
        }
        return undefined
    }

    async getInstanceStatus(serverId: string): Promise<ScalewayServerState | undefined> {
        this.logger.debug(`Getting Scaleway virtual machine state: ${serverId}`)

        try  {
            const server = await this.instanceClient.getServer({ serverId })

            if (!server.server) {
                throw new Error(`Server with id ${serverId} not found while getting status`)
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
            throw new Error(`Failed to get Scaleway virtual machine status: ${serverId}`, { cause: error })
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
                reject(new Error(`Operation timed out after ${timeoutMs} ms`))
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
