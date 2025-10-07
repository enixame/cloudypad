import { ScalewayInstanceInput, ScalewayInstanceStateV1, ScalewayProvisionInputV1 } from "./state"
import { CommonConfigurationInputV1, CommonInstanceInput } from "../../core/state/state"
import { input, select } from '@inquirer/prompts';
import { AbstractInputPrompter, PromptOptions } from "../../cli/prompter";
import { ScalewayClient } from "./sdk-client";
import { CLOUDYPAD_PROVIDER_SCALEWAY } from "../../core/const";
import { PartialDeep } from "type-fest";
import { CLI_OPTION_AUTO_STOP_TIMEOUT, CLI_OPTION_AUTO_STOP_ENABLE, CLI_OPTION_STREAMING_SERVER, CLI_OPTION_SUNSHINE_IMAGE_REGISTRY, CLI_OPTION_SUNSHINE_IMAGE_TAG, CLI_OPTION_SUNSHINE_PASSWORD, CLI_OPTION_SUNSHINE_USERNAME, CliCommandGenerator, CreateCliArgs, UpdateCliArgs, CLI_OPTION_USE_LOCALE, CLI_OPTION_KEYBOARD_LAYOUT, CLI_OPTION_KEYBOARD_MODEL, CLI_OPTION_KEYBOARD_VARIANT, CLI_OPTION_KEYBOARD_OPTIONS, CLI_OPTION_DATA_DISK_SIZE, CLI_OPTION_ROOT_DISK_SIZE, BuildCreateCommandArgs, BuildUpdateCommandArgs, CLI_OPTION_DELETE_INSTANCE_SERVER_ON_STOP, CLI_OPTION_RATE_LIMIT_MAX_MBPS, CLI_OPTION_SUNSHINE_MAX_BITRATE_KBPS } from "../../cli/command";
import { InteractiveInstanceInitializer } from "../../cli/initializer";
import { RUN_COMMAND_CREATE, RUN_COMMAND_UPDATE } from "../../tools/analytics/events";
import { InteractiveInstanceUpdater } from "../../cli/updater";
import { ScalewayProviderClient } from "./provider";
import { Command } from "@commander-js/extra-typings";
import { createDataDiskSnapshot, restoreDataDiskSnapshot, validateSnapshotName, snapshotAndDeleteDataDisk } from "../../infrastructure/scaleway/snapshot";
import { createClient, Block } from '@scaleway/sdk'
import { loadProfileFromConfigurationFile } from '@scaleway/configuration-loader'
import { CoreConfig } from "../../core/config/interface";

export interface ScalewayCreateCliArgs extends CreateCliArgs {
    projectId?: string
    region?: string
    zone?: string
    instanceType?: string
    rootDiskSize?: number
    imageId?: string
    dataDiskSize?: number
    deleteInstanceServerOnStop?: boolean
}

export type ScalewayUpdateCliArgs = UpdateCliArgs & Omit<ScalewayCreateCliArgs, "projectId" | "zone" | "region" | "volumeType" >

export class ScalewayInputPrompter extends AbstractInputPrompter<ScalewayCreateCliArgs, ScalewayProvisionInputV1, CommonConfigurationInputV1> {
    
    protected buildProvisionerInputFromCliArgs(cliArgs: ScalewayCreateCliArgs): PartialDeep<ScalewayInstanceInput> {

        return {
            provision: {
                region: cliArgs.region,
                zone: cliArgs.zone,
                projectId: cliArgs.projectId,
                instanceType: cliArgs.instanceType,
                diskSizeGb: cliArgs.rootDiskSize,
                imageId: cliArgs.imageId,
                dataDiskSizeGb: cliArgs.dataDiskSize,
                deleteInstanceServerOnStop: cliArgs.deleteInstanceServerOnStop
            }
        }
    }

    protected async promptSpecificInput(commonInput: CommonInstanceInput, partialInput: PartialDeep<ScalewayInstanceInput>, createOptions: PromptOptions): Promise<ScalewayInstanceInput> {
        
        if(!createOptions.autoApprove && !createOptions.skipQuotaWarning){
            await this.informCloudProviderQuotaWarning(CLOUDYPAD_PROVIDER_SCALEWAY, "https://docs.cloudypad.gg/cloud-provider-setup/scaleway.html")
        }

        ScalewayClient.checkLocalConfig()

        const defaulScwClient = new ScalewayClient(ScalewayInputPrompter.name, {})

        const projectId = await this.projectId(defaulScwClient, partialInput.provision?.projectId)
        const region = await this.region(defaulScwClient, partialInput.provision?.region)
        const zone = await this.zone(defaulScwClient, region, partialInput.provision?.zone)

        // subsequent inputs can use selected zone and region
        const zonalScwClient = new ScalewayClient(ScalewayInputPrompter.name, {
            region: region,
            zone: zone
        })

        const instanceType = await this.instanceType(zonalScwClient, partialInput.provision?.instanceType)
        const rootDiskSizeGb = await this.rootDiskSize(partialInput.provision?.diskSizeGb)
        const dataDiskSizeGb = await this.dataDiskSize(partialInput.provision?.dataDiskSizeGb)

        const scwInput: ScalewayInstanceInput = {
            configuration: commonInput.configuration,
            instanceName: commonInput.instanceName,
            provision: {
                ssh: commonInput.provision.ssh,
                region: region,
                projectId: projectId,
                zone: zone,
                instanceType: instanceType,
                diskSizeGb: rootDiskSizeGb,
                dataDiskSizeGb: dataDiskSizeGb,
                imageId: partialInput.provision?.imageId,
                deleteInstanceServerOnStop: partialInput.provision?.deleteInstanceServerOnStop
            }
        }
        
        return scwInput
        
    }

    private async instanceType(client: ScalewayClient, instanceType?: string): Promise<string> {
        if (instanceType) {
            return instanceType
        }

        const sizes = await client.listGpuInstanceTypes(1) // only show instance with 1 GPU by default   

        const choices = sizes
            .sort((a, b) => a.cpu - b.cpu)
            .map(s => ({ name: `${s.name} (${s.cpu} CPU, ${s.ramGb} GB RAM, ${s.gpu} GPU)`, value: s.name }))

        if(choices.length == 0){
            console.warn("⚠️ No GPU instance type found in selected region and zone. You may want to use another region or zone.")
        }

        choices.push({ name: "Let me type an instance type", value: "_" })

        let selectedType = await select({
            message: 'Instance type:',
            choices: choices,
            loop: false
        })

        if(selectedType === "_"){
            selectedType = await input({
                message: 'Type an instance type:',
            })
        }

        return selectedType
    }

    private async rootDiskSize(diskSize?: number): Promise<number> {
        if (diskSize) {
            return diskSize
        }

        // If not overridden, use a static default value$
        // As OS disk size is managed by Cloudy Pad and should not impact user 
        // except for specific customizations
        return 20
    }

    private async dataDiskSize(diskSize?: number): Promise<number> {
        if (diskSize !== undefined) { // allow 0 meaning explicit no data disk
            return diskSize
        }

        let selectedDiskSize: string
        let parsedDiskSize: number | undefined = undefined

        while (parsedDiskSize === undefined || isNaN(parsedDiskSize)) {
            selectedDiskSize = await input({
                message: 'Data disk size in GB (OS will use another independent disk)',
                default: "100"
            })
            parsedDiskSize = Number.parseInt(selectedDiskSize)
        }

        return parsedDiskSize
    }

    private async region(client: ScalewayClient, region?: string): Promise<string> {
        if (region) {
            return region
        }

        const locs = ScalewayClient.listRegions()

        const choices = locs.map(l => ({ name: l, value: l})).sort()

        return await select({
            message: 'Region:',
            choices: choices,
            loop: false
        })
    }

    private async zone(client: ScalewayClient, region: string, zone?: string): Promise<string> {
        if (zone) {
            return zone
        }

        const locs = ScalewayClient.listZones()

        const choices = locs
            .filter(l => l.startsWith(region))
            .map(l => ({ name: l, value: l})).sort()

        return await select({
            message: 'Zone:',
            choices: choices,
            loop: false
        })
    }

    private async projectId(client: ScalewayClient, projId?: string): Promise<string> {

        if (projId) {
            return projId;
        }

        const projs = await client.listProjects()

        // No prompt if a single project is available
        if(projs.length == 1){
            return projs[0].id
        }

        const choices = projs.filter(s => s.id !== undefined)
            .map(s => ({ name: `${s.name} (${s.id})`, value: s.id}))

        return await select({
            message: 'Project:',
            choices: choices,
            loop: false
        })
    }
}

export class ScalewayCliCommandGenerator extends CliCommandGenerator {
    
    buildCreateCommand(args: BuildCreateCommandArgs) {
        return this.getBaseCreateCommand(CLOUDYPAD_PROVIDER_SCALEWAY)
            .addOption(CLI_OPTION_ROOT_DISK_SIZE)
            .addOption(CLI_OPTION_DATA_DISK_SIZE)
            .addOption(CLI_OPTION_STREAMING_SERVER)
            .addOption(CLI_OPTION_SUNSHINE_USERNAME)
            .addOption(CLI_OPTION_SUNSHINE_PASSWORD)
            .addOption(CLI_OPTION_SUNSHINE_IMAGE_TAG)
            .addOption(CLI_OPTION_SUNSHINE_IMAGE_REGISTRY)
            .addOption(CLI_OPTION_SUNSHINE_MAX_BITRATE_KBPS)
            .addOption(CLI_OPTION_AUTO_STOP_ENABLE)
            .addOption(CLI_OPTION_AUTO_STOP_TIMEOUT)
            .addOption(CLI_OPTION_USE_LOCALE)
            .addOption(CLI_OPTION_KEYBOARD_LAYOUT)
            .addOption(CLI_OPTION_KEYBOARD_MODEL)
            .addOption(CLI_OPTION_KEYBOARD_VARIANT)
            .addOption(CLI_OPTION_KEYBOARD_OPTIONS)
            .addOption(CLI_OPTION_RATE_LIMIT_MAX_MBPS)
            .addOption(CLI_OPTION_DELETE_INSTANCE_SERVER_ON_STOP)
            .option('--region <region>', 'Region in which to deploy instance')
            .option('--zone <zone>', 'Zone in which to deploy instance')
            .option('--project-id <projectid>', 'Project ID in which to deploy resources')
            .option('--instance-type <instance-type>', 'Instance type')
            .option('--image-id <image-id>', 'Existing image ID for instance server. Disk size must be equal or greater than image size.')
            .action(async (cliArgs: ScalewayCreateCliArgs) => {
                this.analytics.sendEvent(RUN_COMMAND_CREATE, { provider: CLOUDYPAD_PROVIDER_SCALEWAY })

                try {
                    const scalewayProviderClient = new ScalewayProviderClient({ config: args.coreConfig })
                    const scalewayInstanceInitializer = new InteractiveInstanceInitializer<ScalewayInstanceStateV1, ScalewayCreateCliArgs>({
                        providerClient: scalewayProviderClient,
                        inputPrompter: new ScalewayInputPrompter({ coreConfig: args.coreConfig }),
                        initArgs: cliArgs
                    })

                    await scalewayInstanceInitializer.initializeInteractive()
                    
                    
                } catch (error) {   
                    throw new Error('Scaleway instance initilization failed', { cause: error })
                }
            })
    }

    buildUpdateCommand(args: BuildUpdateCommandArgs) {
        return this.getBaseUpdateCommand(CLOUDYPAD_PROVIDER_SCALEWAY)
            .addOption(CLI_OPTION_ROOT_DISK_SIZE)
            .addOption(CLI_OPTION_DATA_DISK_SIZE)
            .addOption(CLI_OPTION_SUNSHINE_USERNAME)
            .addOption(CLI_OPTION_SUNSHINE_PASSWORD)
            .addOption(CLI_OPTION_SUNSHINE_IMAGE_TAG)
            .addOption(CLI_OPTION_SUNSHINE_IMAGE_REGISTRY)
            .addOption(CLI_OPTION_SUNSHINE_MAX_BITRATE_KBPS)
            .addOption(CLI_OPTION_AUTO_STOP_ENABLE)
            .addOption(CLI_OPTION_AUTO_STOP_TIMEOUT)
            .addOption(CLI_OPTION_USE_LOCALE)
            .addOption(CLI_OPTION_KEYBOARD_LAYOUT)
            .addOption(CLI_OPTION_KEYBOARD_MODEL)
            .addOption(CLI_OPTION_KEYBOARD_VARIANT)
            .addOption(CLI_OPTION_KEYBOARD_OPTIONS)
            .addOption(CLI_OPTION_RATE_LIMIT_MAX_MBPS)
            .addOption(CLI_OPTION_DELETE_INSTANCE_SERVER_ON_STOP)
            .option('--instance-type <instance-type>', 'Instance type')
            .option('--image-id <image-id>', 'Existing image ID for instance server. Disk size must be equal or greater than image size.')
            .action(async (cliArgs: ScalewayUpdateCliArgs) => {
                this.analytics.sendEvent(RUN_COMMAND_UPDATE, { provider: CLOUDYPAD_PROVIDER_SCALEWAY })

                try {
                    await new InteractiveInstanceUpdater<ScalewayInstanceStateV1, ScalewayUpdateCliArgs>({
                        providerClient: new ScalewayProviderClient({ config: args.coreConfig }),
                        inputPrompter: new ScalewayInputPrompter({ coreConfig: args.coreConfig }),
                    }).updateInteractive(cliArgs)
                    
                    console.info(`Updated instance ${cliArgs.name}`)
                    
                } catch (error) {
                    throw new Error('Scaleway instance update failed', { cause: error })
                }
            })
    }

    buildSnapshotCommand(args: { coreConfig: CoreConfig }): Command<[string]> {
        return new Command(CLOUDYPAD_PROVIDER_SCALEWAY)
            .description(`Create or restore a data disk snapshot for ${CLOUDYPAD_PROVIDER_SCALEWAY}`)
            .argument('<snapshotName>', 'Snapshot name (pattern: [a-z0-9-_], length ≤ 63)')
            .requiredOption('--name <name>', 'Instance name')
            .option('--restore', 'Restore the snapshot instead of creating one')
            .option('--yes', 'Do not prompt for approval, automatically approve and continue')
            .option('--delete-old-disk', 'After a successful restore, delete the previous data disk (requires --yes)')
            .option('--delete-snapshot', 'After a successful restore, delete the snapshot (requires --yes)')
            .option('--delete-data-disk', 'On snapshot creation, delete the current data disk to archive and reduce costs (requires --yes)')
            .action(async (snapshotName: string, opts: { name: string, restore?: boolean, yes?: boolean, deleteOldDisk?: boolean, deleteSnapshot?: boolean, deleteDataDisk?: boolean }) => {
                this.analytics.sendEvent(opts.restore ? 'snapshot-restore' : 'snapshot-create', { provider: CLOUDYPAD_PROVIDER_SCALEWAY })

                validateSnapshotName(snapshotName)

                const provider = new ScalewayProviderClient({ config: args.coreConfig })
                const state = await provider.getInstanceState(opts.name)
                const stateWriter = provider.getStateWriter()

                const provisionOut = state.provision.output
                const provisionIn = state.provision.input
                if (!provisionOut) throw new Error('Instance is not provisioned yet; provision output missing in state')
                if (!provisionOut.instanceServerId) throw new Error('Invalid state: instanceServerId missing')
                if (!provisionOut.host) throw new Error('Invalid state: host missing from provision output')
                // For snapshot creation we need a data disk; for restore we can proceed without
                // Try to verify existing ID or discover one; but allow undefined when --restore is set
                let currentDataDiskId = provisionOut.dataDiskId
                const scw = new (await import('./sdk-client')).ScalewayClient('scw-discover', { projectId: provisionIn.projectId, zone: provisionIn.zone })
                const verifyOrDiscover = async (): Promise<string | undefined> => {
                    const tryId = currentDataDiskId
                    if (tryId) {
                        try {
                            const client = createClient({ ...loadProfileFromConfigurationFile(), defaultZone: provisionIn.zone })
                            const block = new Block.v1alpha1.API(client)
                            await block.getVolume({ volumeId: tryId })
                            return tryId
                        } catch {
                            // fallthrough to discovery
                        }
                    }
                    const discovered = await scw.findCurrentDataDiskId(provisionOut.instanceServerId!)
                    if (discovered) {
                        console.warn(`Using attached data disk ${discovered} (state had ${tryId ?? 'none'}). Updating state.`)
                        await stateWriter.setProvisionOutput(state.name, { ...provisionOut, dataDiskId: discovered })
                        currentDataDiskId = discovered
                        return discovered
                    }
                    return undefined
                }
                const dataDiskId = await verifyOrDiscover()

                if (!opts.restore) {
                    if (!dataDiskId) {
                        throw new Error('No data disk found on this instance. Configure a data disk first.')
                    }
                    const { snapshotId } = await createDataDiskSnapshot({
                        instanceName: state.name,
                        projectId: provisionIn.projectId,
                        zone: provisionIn.zone,
                        dataDiskId: dataDiskId,
                        snapshotName,
                    })
                    console.info(`Snapshot created: ${snapshotId}`)
                    if (opts.deleteDataDisk) {
                        if (!opts.yes) {
                            console.warn("--delete-data-disk requested but --yes not provided; skipping data disk deletion. Re-run with --yes to confirm.")
                        } else {
                            await snapshotAndDeleteDataDisk({
                                instanceName: state.name,
                                projectId: provisionIn.projectId,
                                zone: provisionIn.zone,
                                dataDiskId: dataDiskId,
                                snapshotName,
                                instanceServerId: provisionOut.instanceServerId!,
                            })
                            // Clear dataDiskId in state since we've deleted it to archive costs
                            const cleared = { ...provisionOut, dataDiskId: undefined }
                            await stateWriter.setProvisionOutput(state.name, cleared)
                        }
                    }
                } else {
                    const { newDataDiskId } = await restoreDataDiskSnapshot({
                        instanceName: state.name,
                        projectId: provisionIn.projectId,
                        zone: provisionIn.zone,
                        instanceServerId: provisionOut.instanceServerId!,
                        oldDataDiskId: dataDiskId,
                        snapshotName,
                        ssh: provisionIn.ssh,
                        host: provisionOut.host,
                        publicIPv4: provisionOut.publicIPv4,
                        autoApprove: opts.yes === true,
                        deleteOldDisk: (opts.deleteOldDisk === true) && (opts.yes === true),
                        deleteSnapshot: (opts.deleteSnapshot === true) && (opts.yes === true),
                        coreConfig: args.coreConfig,
                    })
                    console.info(`Restored snapshot '${snapshotName}' on instance ${state.name}`)
                    // Persist new data disk id in state
                    const updated = { ...provisionOut, dataDiskId: newDataDiskId }
                    await stateWriter.setProvisionOutput(state.name, updated)
                    if(opts.deleteOldDisk && !opts.yes){
                        console.warn("--delete-old-disk requested but --yes not provided; skipping old disk deletion. Re-run with --yes to confirm.")
                    }
                    if(opts.deleteSnapshot && !opts.yes){
                        console.warn("--delete-snapshot requested but --yes not provided; skipping snapshot deletion. Re-run with --yes to confirm.")
                    }
                }
            })
    }
    
    static buildDiagnosePulumiCommand(coreConfig: CoreConfig): Command {
        return new Command()
            .name('diagnose-pulumi')
            .description('Diagnose and repair Pulumi-related issues for Scaleway instances')
            .requiredOption('--name <name>', 'Instance name to diagnose')
            .option('--auto-fix', 'Automatically fix detected issues', false)
            .action(async (opts: { name: string, autoFix?: boolean }) => {
                const { diagnosePulumiIssues } = await import('../../infrastructure/scaleway/snapshot')
                
                console.log(`🔍 Diagnosing Pulumi issues for instance: ${opts.name}`)
                
                const result = await diagnosePulumiIssues(opts.name)
                
                if (result.issues.length === 0) {
                    console.log('✅ No Pulumi issues detected')
                    return
                }
                
                console.log('\n🚨 Issues detected:')
                result.issues.forEach((issue, i) => {
                    console.log(`  ${i + 1}. ${issue}`)
                })
                
                console.log('\n💡 Recommendations:')
                result.recommendations.forEach((rec, i) => {
                    console.log(`  ${i + 1}. ${rec}`)
                })
                
                if (result.autoFixApplied) {
                    console.log('\n🔧 Auto-fixes were applied')
                }
                
                if (opts.autoFix && !result.autoFixApplied) {
                    console.log('\n🔧 Auto-fix requested but no automatic fixes are available for these issues')
                }
            })
    }
}