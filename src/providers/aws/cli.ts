import { AwsInstanceInput, AwsInstanceStateV1, AwsProvisionInputV1 } from "./state"
import { CommonConfigurationInputV1, CommonInstanceInput } from "../../core/state/state"
import { input, select, confirm } from '@inquirer/prompts';
import { AwsClient, EC2_QUOTA_CODE_ALL_G_AND_VT_SPOT_INSTANCES, EC2_QUOTA_CODE_RUNNING_ON_DEMAND_G_AND_VT_INSTANCES } from "./sdk-client";
import { AbstractInputPrompter, AbstractInputPrompterArgs, costAlertCliArgsIntoConfig, PromptOptions } from "../../cli/prompter";
import lodash from 'lodash'
import { CLI_OPTION_COST_NOTIFICATION_EMAIL, CLI_OPTION_COST_ALERT, CLI_OPTION_COST_LIMIT, CLI_OPTION_ROOT_DISK_SIZE, CLI_OPTION_DATA_DISK_SIZE, CLI_OPTION_DATA_DISK_PERFORMANCE, CLI_OPTION_PUBLIC_IP_TYPE, CLI_OPTION_SPOT, CliCommandGenerator, CreateCliArgs, UpdateCliArgs, CLI_OPTION_STREAMING_SERVER, CLI_OPTION_SUNSHINE_PASSWORD, CLI_OPTION_SUNSHINE_USERNAME, CLI_OPTION_SUNSHINE_IMAGE_REGISTRY, CLI_OPTION_SUNSHINE_IMAGE_TAG, CLI_OPTION_AUTO_STOP_TIMEOUT, CLI_OPTION_AUTO_STOP_ENABLE, CLI_OPTION_KEYBOARD_OPTIONS, CLI_OPTION_KEYBOARD_VARIANT, CLI_OPTION_KEYBOARD_MODEL, CLI_OPTION_KEYBOARD_LAYOUT, CLI_OPTION_USE_LOCALE, BuildCreateCommandArgs, BuildUpdateCommandArgs, CLI_OPTION_RATE_LIMIT_MAX_MBPS, CLI_OPTION_SUNSHINE_MAX_BITRATE_KBPS } from "../../cli/command";
import { CLOUDYPAD_PROVIDER_AWS, PUBLIC_IP_TYPE } from "../../core/const";
import { InteractiveInstanceInitializer } from "../../cli/initializer";
import { PartialDeep } from "type-fest";
import { RUN_COMMAND_CREATE, RUN_COMMAND_UPDATE } from "../../tools/analytics/events";
import { InteractiveInstanceUpdater } from "../../cli/updater";
import { cleanupAndExit, handleErrorAnalytics, logFullError } from "../../cli/program";
import { AwsProviderClient } from "./provider";

export interface AwsCreateCliArgs extends CreateCliArgs {
    spot?: boolean
    diskSize?: number // deprecated, kept for backward compatibility
    rootDiskSize?: number
    dataDiskSize?: number
    dataDiskPerformance?: string // "standard" | "high" | "maximum"
    publicIpType?: PUBLIC_IP_TYPE
    instanceType?: string
    region?: string
    costAlert?: boolean
    costLimit?: number
    costNotificationEmail?: string
}

/**
 * Possible update arguments for AWS update. Region and spot cannot be updated as it would destroy existing machine and/or disk. 
 */
export type AwsUpdateCliArgs = UpdateCliArgs & Omit<AwsCreateCliArgs, "region" | "spot">

/**
 * Supported instance types for AWS. Other instance types may work but are not tested.
 * Bigger instances (eg. 16x large or metal) should work but are overkill for most users, not listing them by default.
 */
export const SUPPORTED_INSTANCE_TYPES = [
    "g4dn.xlarge", "g4dn.2xlarge", "g4dn.4xlarge",
    "g5.xlarge", "g5.2xlarge", "g5.4xlarge", "g5.8xlarge",
    "g6.xlarge", "g6.2xlarge", "g6.4xlarge", "g6.8xlarge",
]

/**
 * Performance profiles for gp3 data disks
 * AWS gp3 baseline: 3000 IOPS, 125 MB/s (included at no extra cost)
 * AWS gp3 max: 16000 IOPS, 1000 MB/s
 */
export interface DataDiskPerformanceProfile {
    name: string
    description: string
    iops: number
    throughput: number // MB/s
    additionalCost: string
}

export const DATA_DISK_PERFORMANCE_PROFILES: DataDiskPerformanceProfile[] = [
    {
        name: "standard",
        description: "Standard (3000 IOPS, 125 MB/s) - Free, included with gp3",
        iops: 3000,
        throughput: 125,
        additionalCost: "Free"
    },
]

export class AwsInputPrompter extends AbstractInputPrompter<AwsCreateCliArgs, AwsProvisionInputV1, CommonConfigurationInputV1> {

    constructor(args: AbstractInputPrompterArgs){
        super(args)
    }

    buildProvisionerInputFromCliArgs(cliArgs: AwsCreateCliArgs): PartialDeep<AwsInstanceInput> {

        const provision: PartialDeep<AwsInstanceInput["provision"]> = {
            instanceType: cliArgs.instanceType,
            rootDiskSizeGb: cliArgs.rootDiskSize,
            dataDiskSizeGb: cliArgs.dataDiskSize,
            publicIpType: cliArgs.publicIpType,
            region: cliArgs.region,
            useSpot: cliArgs.spot,
            costAlert: costAlertCliArgsIntoConfig(cliArgs)
        }
        
        // Only include diskSize if explicitly provided (for backward compatibility)
        if (cliArgs.diskSize !== undefined) {
            provision.diskSize = cliArgs.diskSize
        }
        
        // Convert performance profile to IOPS and throughput
        // Note: This needs instanceType to generate accurate profiles
        // If CLI args include dataDiskPerformance but not instanceType, 
        // conversion will happen later in promptSpecificInput when instanceType is known
        if (cliArgs.dataDiskPerformance && cliArgs.instanceType) {
            const maxThroughput = this.getInstanceMaxEbsThroughput(cliArgs.instanceType)
            const profiles = this.generateDataDiskProfilesForInstance(cliArgs.instanceType, maxThroughput)
            const profile = profiles.find(p => p.name === cliArgs.dataDiskPerformance)
            if (profile) {
                provision.dataDiskIops = profile.iops
                provision.dataDiskThroughput = profile.throughput
            }
        }
        
        // Store the profileName for later resolution if instanceType wasn't provided yet
        // Will be resolved in promptSpecificInput when instanceType is known
        // Using a temporary property that won't be in final state
        const result: PartialDeep<AwsInstanceInput> & { _cliDataDiskPerformance?: string } = { provision }
        if (cliArgs.dataDiskPerformance && !provision.dataDiskIops && !provision.dataDiskThroughput) {
            result._cliDataDiskPerformance = cliArgs.dataDiskPerformance
        }

        return result
    }

    protected async promptSpecificInput(commonInput: CommonInstanceInput, partialInput: PartialDeep<AwsInstanceInput>, createOptions: PromptOptions): Promise<AwsInstanceInput> {

        if(!createOptions.autoApprove && !createOptions.skipQuotaWarning){
            await this.informCloudProviderQuotaWarning(CLOUDYPAD_PROVIDER_AWS, "https://docs.cloudypad.gg/cloud-provider-setup/aws.html")
        }

        const region = await this.region(partialInput.provision?.region)
        const useSpot = await this.useSpotInstance(partialInput.provision?.useSpot)
        const instanceType = await this.instanceType(region, useSpot, partialInput.provision?.instanceType)
        const rootDiskSize = await this.rootDiskSize(partialInput.provision?.rootDiskSizeGb)
        const dataDiskSize = await this.dataDiskSize(partialInput.provision?.dataDiskSizeGb)
        
        // Only ask for performance profile if data disk is being created and not already specified
        let dataDiskIops = partialInput.provision?.dataDiskIops
        let dataDiskThroughput = partialInput.provision?.dataDiskThroughput
        
        if (dataDiskSize > 0 && (dataDiskIops === undefined || dataDiskThroughput === undefined)) {
            // Check if a CLI performance profile name was provided but not yet resolved
            const partialInputWithCliArgs = partialInput as PartialDeep<AwsInstanceInput> & { _cliDataDiskPerformance?: string }
            const cliPerfName = partialInputWithCliArgs._cliDataDiskPerformance
            
            if (cliPerfName) {
                // Resolve the CLI performance profile name to IOPS/throughput based on instanceType
                const maxThroughput = this.getInstanceMaxEbsThroughput(instanceType)
                const profiles = this.generateDataDiskProfilesForInstance(instanceType, maxThroughput)
                const profile = profiles.find(p => p.name === cliPerfName)
                if (profile) {
                    dataDiskIops = profile.iops
                    dataDiskThroughput = profile.throughput
                }
            }
            
            // If still not set, prompt user
            if (dataDiskIops === undefined || dataDiskThroughput === undefined) {
                const dataDiskPerformance = await this.dataDiskPerformance(instanceType, dataDiskIops, dataDiskThroughput)
                dataDiskIops = dataDiskPerformance.iops
                dataDiskThroughput = dataDiskPerformance.throughput
            }
        }
        
        const publicIpType = await this.publicIpType(partialInput.provision?.publicIpType)
        const costAlert = await this.costAlert(partialInput.provision?.costAlert)
                
        const awsInput: AwsInstanceInput = lodash.merge(
            {},
            commonInput, 
            {
                provision:{
                    rootDiskSizeGb: rootDiskSize,
                    dataDiskSizeGb: dataDiskSize,
                    dataDiskIops: dataDiskIops,
                    dataDiskThroughput: dataDiskThroughput,
                    instanceType: instanceType,
                    publicIpType: publicIpType,
                    region: region,
                    useSpot: useSpot,
                    costAlert: costAlert,
                }
            })
        
        return awsInput
        
    }

    private async instanceType(region: string, useSpot: boolean, instanceType?: string): Promise<string> {

        if (instanceType) {
            return instanceType;
        }

        // fetch AWS instance type details
        const awsClient = new AwsClient("instance-type-prompt", region)
        const availableInstanceTypes = await awsClient.filterAvailableInstanceTypes(SUPPORTED_INSTANCE_TYPES)
        const instanceTypeDetails = await awsClient.getInstanceTypeDetails(availableInstanceTypes)

        const choices = instanceTypeDetails
            .filter(typeInfo => typeInfo.InstanceType)
            .sort((a, b) => {
                // Sort by vCPU count
                const aVCpu = a.VCpuInfo?.DefaultVCpus || 0;
                const bVCpu = b.VCpuInfo?.DefaultVCpus || 0;
                return aVCpu - bVCpu;
            })
            .map(typeInfo => {
                const instanceType = typeInfo.InstanceType! // guaranteed to exist with filter
                const memoryGb = typeInfo.MemoryInfo?.SizeInMiB ? typeInfo.MemoryInfo?.SizeInMiB / 1024 : undefined
                return {
                    name: `${instanceType} - ${typeInfo.VCpuInfo?.DefaultVCpus} vCPU - ${memoryGb} GiB Memory`,
                    value: String(instanceType),
                }
            })

        choices.push({name: "Let me type an instance type", value: "_"})

        const selectedInstanceType = await select({
            message: 'Choose an instance type:',
            default: "g4dn.xlarge",
            choices: choices,
            loop: false,
        })

        if(selectedInstanceType === '_'){
            return await input({
                message: 'Enter machine type:',
            })
        }

        // Check quotas for select instance type
        // Depending on spot usage, quota is different
        const quotaCode = useSpot ? EC2_QUOTA_CODE_ALL_G_AND_VT_SPOT_INSTANCES : EC2_QUOTA_CODE_RUNNING_ON_DEMAND_G_AND_VT_INSTANCES
        const currentQuota = await awsClient.getQuota(quotaCode)
        
        const selectInstanceTypeDetails = instanceTypeDetails.find(typeInfo => typeInfo.InstanceType === selectedInstanceType)

        if(currentQuota === undefined || selectInstanceTypeDetails === undefined || selectInstanceTypeDetails.VCpuInfo?.DefaultVCpus === undefined){
            this.logger.warn(`No quota found for machine type ${JSON.stringify(selectInstanceTypeDetails)} in region ${region}`)
            this.logger.warn(`Unable to check for quota before creating instance ${selectedInstanceType} in ${region}. Instance creation may fail.` + 
                `See https://docs.cloudypad.gg/cloud-provider-setup/aws.html for details about quotas`)

        } else if (currentQuota < selectInstanceTypeDetails.VCpuInfo?.DefaultVCpus) {
            this.logger.debug(`Quota found for machine type ${JSON.stringify(selectInstanceTypeDetails)} in region ${region}: ${currentQuota}`)

            const confirmQuota = await confirm({
                message: `Uh oh. It seems quotas for machine type ${selectedInstanceType} in region ${region} may be too low. \n` +
                `You can still try to provision the instance, but it may fail.\n\n` +
                `Current quota: ${currentQuota} vCPUS\n` +
                `Required quota: ${selectInstanceTypeDetails.VCpuInfo?.DefaultVCpus} vCPUs\n\n` +
                `Checkout https://docs.cloudypad.gg/cloud-provider-setup/aws.html for details about quotas.\n\n` +
                `Do you still want to continue?`,
                default: false,
            })

            if(!confirmQuota){
                throw new Error(`Stopped instance creation: detected quota were not high enough for ${selectedInstanceType} in ${region}`)
            }
        }

        return selectedInstanceType        
    }

    private async rootDiskSize(diskSize?: number): Promise<number> {
        if (diskSize) {
            return diskSize;
        }

        // If not overridden, use a static default value
        // As OS disk size is managed by Cloudy Pad and should not impact user 
        // except for specific customizations
        return 20
    }

    private async dataDiskSize(diskSize?: number): Promise<number> {
        if (diskSize !== undefined) { // allow 0 meaning explicit no data disk
            return diskSize;
        }

        let selectedDiskSize: string
        let parsedDiskSize: number | undefined = undefined

        while (parsedDiskSize === undefined || isNaN(parsedDiskSize)) {
            selectedDiskSize = await input({
                message: 'Data disk size in GB (OS will use another independent disk):',
                default: "100"
            })
            parsedDiskSize = Number.parseInt(selectedDiskSize)
        }

        return parsedDiskSize
    }

    private async dataDiskPerformance(instanceType: string, iops?: number, throughput?: number): Promise<{ iops?: number, throughput?: number }> {
        // If already provided, return them
        if (iops !== undefined && throughput !== undefined) {
            return { iops, throughput }
        }

        // Get instance capabilities
        const maxThroughput = this.getInstanceMaxEbsThroughput(instanceType)
        const ebsInfo = this.getInstanceEbsBandwidthInfo(instanceType)
        
        // Generate dynamic profiles based on instance capabilities
        const profiles = this.generateDataDiskProfilesForInstance(instanceType, maxThroughput)
        const recommendedProfile = this.getRecommendedProfileForInstance(instanceType)
        
        // Build choices with descriptions
        const choices = profiles.map(profile => ({
            name: profile.description,
            value: profile.name
        }))

        let message = 'Data disk performance profile:'
        if (ebsInfo) {
            message = `Data disk performance profile (Instance EBS bandwidth: ${ebsInfo}):`
        }

        const selectedProfile = await select({
            message: message,
            choices: choices,
            default: recommendedProfile,
            loop: false
        })

        const profile = profiles.find(p => p.name === selectedProfile)
        
        if (!profile) {
            return {}
        }

        return {
            iops: profile.iops,
            throughput: profile.throughput
        }
    }

    /**
     * Generate dynamic performance profiles adapted to instance EBS bandwidth
     */
    private generateDataDiskProfilesForInstance(instanceType: string, maxThroughput: number | null): DataDiskPerformanceProfile[] {
        // gp3 constraints
        const GP3_MIN_THROUGHPUT = 125
        const GP3_MAX_THROUGHPUT = 1000
        const GP3_MIN_IOPS = 3000
        const GP3_MAX_IOPS = 16000
        
        const recommendedProfile = this.getRecommendedProfileForInstance(instanceType)
        
        // If we don't know the instance max throughput, use static profiles
        if (!maxThroughput) {
            return DATA_DISK_PERFORMANCE_PROFILES.map(profile => ({
                ...profile,
                description: profile.name === recommendedProfile 
                    ? `${profile.description} ⭐ Recommended`
                    : profile.description
            }))
        }

        // Cap maximum throughput to both gp3 max and instance max
        const effectiveMaxThroughput = Math.min(maxThroughput, GP3_MAX_THROUGHPUT)
        
        // Calculate profiles: medium (50%), high (75%), maximum (100%)
        const mediumThroughput = Math.min(Math.round(effectiveMaxThroughput * 0.5), GP3_MAX_THROUGHPUT)
        const highThroughput = Math.min(Math.round(effectiveMaxThroughput * 0.75), GP3_MAX_THROUGHPUT)
        
        // IOPS calculation: maintain a good ratio (~16 IOPS per MB/s, AWS recommended ratio)
        const standardIops = GP3_MIN_IOPS
        const mediumIops = Math.min(Math.round(mediumThroughput * 16), GP3_MAX_IOPS)
        const highIops = Math.min(Math.round(highThroughput * 16), GP3_MAX_IOPS)
        const maxIops = Math.min(Math.round(effectiveMaxThroughput * 16), GP3_MAX_IOPS)
        
        // Calculate costs (approximation)
        // gp3 additional cost: $0.005/provisioned IOPS/month + $0.04/provisioned MB/s/month
        const mediumCost = Math.round(((mediumIops - GP3_MIN_IOPS) * 0.005 + (mediumThroughput - GP3_MIN_THROUGHPUT) * 0.04) * 100) / 100
        const highCost = Math.round(((highIops - GP3_MIN_IOPS) * 0.005 + (highThroughput - GP3_MIN_THROUGHPUT) * 0.04) * 100) / 100
        const maxCost = Math.round(((maxIops - GP3_MIN_IOPS) * 0.005 + (effectiveMaxThroughput - GP3_MIN_THROUGHPUT) * 0.04) * 100) / 100

        const profiles: DataDiskPerformanceProfile[] = [
            {
                name: "standard",
                description: `Standard (${GP3_MIN_IOPS} IOPS, ${GP3_MIN_THROUGHPUT} MB/s) - No extra cost${recommendedProfile === 'standard' ? ' ⭐ Recommended' : ''}`,
                iops: standardIops,
                throughput: GP3_MIN_THROUGHPUT,
                additionalCost: "Free"
            },
            {
                name: "medium",
                description: `Medium (${mediumIops} IOPS, ${mediumThroughput} MB/s) - Add ~$${mediumCost}/month${recommendedProfile === 'medium' ? ' ⭐ Recommended' : ''}`,
                iops: mediumIops,
                throughput: mediumThroughput,
                additionalCost: `~$${mediumCost}/month`
            },
            {
                name: "high",
                description: `High (${highIops} IOPS, ${highThroughput} MB/s) - Add ~$${highCost}/month${recommendedProfile === 'high' ? ' ⭐ Recommended' : ''}`,
                iops: highIops,
                throughput: highThroughput,
                additionalCost: `~$${highCost}/month`
            },
            {
                name: "maximum",
                description: `Maximum (${maxIops} IOPS, ${effectiveMaxThroughput} MB/s) - Add ~$${maxCost}/month${effectiveMaxThroughput < maxThroughput ? ' (gp3 limit)' : ''}${recommendedProfile === 'maximum' ? ' ⭐ Recommended' : ''}`,
                iops: maxIops,
                throughput: effectiveMaxThroughput,
                additionalCost: `~$${maxCost}/month`
            }
        ]

        // Add warning if instance bandwidth is limiting
        if (effectiveMaxThroughput < GP3_MAX_THROUGHPUT) {
            profiles[3].description += ` (Instance max: ${maxThroughput} MB/s)`
        }

        return profiles
    }

    /**
     * Get EBS maximum throughput in MB/s for common instance types
     * Note: This is a simplified mapping. For exact values, refer to AWS documentation.
     * Source: https://docs.aws.amazon.com/AWSEC2/latest/UserGuide/ebs-optimized.html
     */
    private getInstanceMaxEbsThroughput(instanceType: string): number | null {
        // Common GPU instance types and their maximum EBS throughput in MB/s
        const maxThroughputMap: Record<string, number> = {
            'g4dn.xlarge': 437,
            'g4dn.2xlarge': 437,
            'g4dn.4xlarge': 593,
            'g4dn.8xlarge': 1187,
            'g4dn.12xlarge': 1187,
            'g4dn.16xlarge': 1187,
            'g5.xlarge': 437,
            'g5.2xlarge': 437,
            'g5.4xlarge': 593,
            'g5.8xlarge': 2000,
            'g5.12xlarge': 2000,
            'g5.16xlarge': 2000,
            'g6.xlarge': 625,
            'g6.2xlarge': 625,
            'g6.4xlarge': 1000,
            'g6.8xlarge': 2000,
            'g6.12xlarge': 2500,
            'g6.16xlarge': 2500,
        }

        return maxThroughputMap[instanceType] || null
    }

    /**
     * Get EBS bandwidth information for common instance types
     */
    private getInstanceEbsBandwidthInfo(instanceType: string): string | null {
        const maxThroughput = this.getInstanceMaxEbsThroughput(instanceType)
        if (!maxThroughput) return null
        
        const gbps = (maxThroughput * 8 / 1000).toFixed(1)
        return `${maxThroughput >= 1000 ? gbps : 'up to ' + gbps} Gbps (~${maxThroughput} MB/s)`
    }

    /**
     * Get recommended performance profile for instance type
     * Recommends the highest profile that is <= 500 MB/s, or the one just below if all exceed 500 MB/s
     */
    private getRecommendedProfileForInstance(instanceType: string): string {
        const maxThroughput = this.getInstanceMaxEbsThroughput(instanceType)
        
        if (!maxThroughput) {
            return "standard" // Default if unknown
        }

        const effectiveMaxThroughput = Math.min(maxThroughput, 1000) // Cap at gp3 max
        
        // Calculate profile throughputs
        const mediumThroughput = Math.round(effectiveMaxThroughput * 0.5)
        const highThroughput = Math.round(effectiveMaxThroughput * 0.75)
        const maximumThroughput = effectiveMaxThroughput
        
        // Recommend the highest profile that is <= 500 MB/s
        if (maximumThroughput <= 500) {
            return "maximum"
        } else if (highThroughput <= 500) {
            return "high"
        } else if (mediumThroughput <= 500) {
            return "medium"
        } else {
            // All profiles exceed 500 MB/s, recommend the one just below (medium at 50%)
            return "medium"
        }
    }

    private async region(region?: string): Promise<string> {
        if (region) {
            return region;
        }

        const currentAwsRegion = await AwsClient.getCurrentRegion()
        const regions = await AwsClient.listRegions()

        return await select({
            message: 'Select an AWS region to deploy instance:',
            choices: regions.map(r => ({
                name: r,
                value: r,
            })),
            loop: false,
            default: currentAwsRegion,
        })
    }
}

export class AwsCliCommandGenerator extends CliCommandGenerator {
    
    buildCreateCommand(args: BuildCreateCommandArgs) {
        return this.getBaseCreateCommand(CLOUDYPAD_PROVIDER_AWS)
            .addOption(CLI_OPTION_SPOT)
            .addOption(CLI_OPTION_ROOT_DISK_SIZE)
            .addOption(CLI_OPTION_DATA_DISK_SIZE)
            .addOption(CLI_OPTION_DATA_DISK_PERFORMANCE)
            .addOption(CLI_OPTION_PUBLIC_IP_TYPE)
            .addOption(CLI_OPTION_COST_ALERT)
            .addOption(CLI_OPTION_COST_LIMIT)
            .addOption(CLI_OPTION_COST_NOTIFICATION_EMAIL)
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
            .option('--instance-type <type>', 'EC2 instance type')
            .option('--region <region>', 'Region in which to deploy instance')
            .action(async (cliArgs: AwsCreateCliArgs) => {
                this.analytics.sendEvent(RUN_COMMAND_CREATE, { provider: CLOUDYPAD_PROVIDER_AWS })
                
                try {
                    await new InteractiveInstanceInitializer<AwsInstanceStateV1, AwsCreateCliArgs>({ 
                        providerClient: new AwsProviderClient({ config: args.coreConfig }),
                        inputPrompter: new AwsInputPrompter({ coreConfig: args.coreConfig }),
                        initArgs: cliArgs
                    }).initializeInteractive()
                    
                } catch (error) {
                    logFullError(error)
                
                    console.error("")
                    console.error("Oops, something went wrong 😨 Full error is shown above.")
                    console.error("")
                    console.error("If you think this is a bug, please file an issue with full error: https://github.com/PierreBeucher/cloudypad/issues")
                    console.error("")
                    console.error("⚠️ Your instance was not created successfully. To cleanup resources and avoid leaving orphaned resources which may be charged, run:")
                    console.error("")
                    console.error("    cloudypad destroy <instance-name>")

                    handleErrorAnalytics(error)
                    await cleanupAndExit(1)
                }
            })
    }

    buildUpdateCommand(args: BuildUpdateCommandArgs) {
        return this.getBaseUpdateCommand(CLOUDYPAD_PROVIDER_AWS)
            .addOption(CLI_OPTION_ROOT_DISK_SIZE)
            .addOption(CLI_OPTION_DATA_DISK_SIZE)
            .addOption(CLI_OPTION_DATA_DISK_PERFORMANCE)
            .addOption(CLI_OPTION_PUBLIC_IP_TYPE)
            .addOption(CLI_OPTION_COST_ALERT)
            .addOption(CLI_OPTION_COST_LIMIT)
            .addOption(CLI_OPTION_COST_NOTIFICATION_EMAIL)
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
            .option('--instance-type <type>', 'EC2 instance type')
            .action(async (cliArgs: AwsUpdateCliArgs) => {
                this.analytics.sendEvent(RUN_COMMAND_UPDATE, { provider: CLOUDYPAD_PROVIDER_AWS })
                
                try {
                    await new InteractiveInstanceUpdater<AwsInstanceStateV1, AwsUpdateCliArgs>({
                        providerClient: new AwsProviderClient({ config: args.coreConfig }),
                        inputPrompter: new AwsInputPrompter({ coreConfig: args.coreConfig }),
                    }).updateInteractive(cliArgs)
                    
                    console.info(`Updated instance ${cliArgs.name}`)
                    
                } catch (error) {
                    throw new Error('Instance update failed', { cause: error })
                }
            })
    }
}