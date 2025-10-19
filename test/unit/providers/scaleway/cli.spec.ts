import { deepEqual, strictEqual } from 'assert/strict';
import sinon from 'sinon';
import { ScalewayCreateCliArgs, ScalewayInputPrompter } from '../../../../src/providers/scaleway/cli';
import { DEFAULT_COMMON_CLI_ARGS, DEFAULT_COMMON_INPUT, getUnitTestCoreConfig } from '../../utils';
import { PartialDeep } from 'type-fest';
import lodash from 'lodash';
import { ScalewayInstanceInput } from '../../../../src/providers/scaleway/state';
import { ScalewayClient } from '../../../../src/providers/scaleway/sdk-client';

describe('Scaleway input prompter', () => {
    let sandbox: sinon.SinonSandbox;

    const instanceName = "scaleway-dummy"
    const coreConfig = getUnitTestCoreConfig()
    
    const TEST_IOPS_TIERS: number[] = [5000, 15000]
    const DEFAULT_TEST_IOPS = 5000

    beforeEach(() => {
        sandbox = sinon.createSandbox();
    });

    afterEach(() => {
        sandbox.restore();
    });

    const TEST_INPUT: ScalewayInstanceInput = {
        instanceName: instanceName,
        provision: {
            ...DEFAULT_COMMON_INPUT.provision,
            projectId: "99999999999999999999",
            region: "fr-par",
            zone: "fr-par-1",
            instanceType: "L4-1-24G",
            diskSizeGb: 20,
            dataDiskSizeGb: 100,
            dataDiskIops: DEFAULT_TEST_IOPS,
            imageId: "123e4567-e89b-12d3-a456-426614174000",
            deleteInstanceServerOnStop: true
        }, 
        configuration: {
            ...DEFAULT_COMMON_INPUT.configuration
        }
    }

    const TEST_CLI_ARGS: ScalewayCreateCliArgs = {
        ...DEFAULT_COMMON_CLI_ARGS,
        name: instanceName,
        rootDiskSize: TEST_INPUT.provision.diskSizeGb,
        dataDiskSize: TEST_INPUT.provision.dataDiskSizeGb,
        dataDiskIops: TEST_INPUT.provision.dataDiskIops,
        instanceType: TEST_INPUT.provision.instanceType,
        region: TEST_INPUT.provision.region,
        zone: TEST_INPUT.provision.zone,
        projectId: TEST_INPUT.provision.projectId,
        imageId: TEST_INPUT.provision.imageId,
        deleteInstanceServerOnStop: true
    }

    it('should return provided inputs without prompting when full input provider', async () => {
        const result = await new ScalewayInputPrompter({ coreConfig: coreConfig }).promptInput(TEST_INPUT, { autoApprove: true })
        const expected = {
            ...TEST_INPUT,
            configuration: {
                ...TEST_INPUT.configuration,
                wolf: null
            }
        }
        deepEqual(result, expected)
    })

    it('should convert CLI args into partial input', () => {
        const prompter = new ScalewayInputPrompter({ coreConfig: coreConfig })
        const result = prompter.cliArgsIntoPartialInput(TEST_CLI_ARGS)

        const expected: PartialDeep<ScalewayInstanceInput> = {
            ...TEST_INPUT,
            provision: {
                ...TEST_INPUT.provision,
                ssh: lodash.omit(TEST_INPUT.provision.ssh, "user"),
            },
            configuration: {
                ...TEST_INPUT.configuration,
                wolf: null
            }
        }
        
        deepEqual(result, expected)
    })

    it('should preserve IOPS when valid IOPS already provided', async () => {
        const inputWithValidIops: ScalewayInstanceInput = lodash.cloneDeep(TEST_INPUT)
        
        sandbox.stub(ScalewayClient.prototype, 'listIopsTiers').resolves(TEST_IOPS_TIERS)

        const result = await new ScalewayInputPrompter({ coreConfig: coreConfig }).promptInput(inputWithValidIops, { autoApprove: true })

        strictEqual(result.provision.dataDiskIops, DEFAULT_TEST_IOPS)
        strictEqual(result.provision.dataDiskSizeGb, 100)
        
        const expected: ScalewayInstanceInput = lodash.merge({}, TEST_INPUT, { 
            provision: { dataDiskIops: DEFAULT_TEST_IOPS },
            configuration: { wolf: null }
        })
        deepEqual(result, expected)
    })

    it('should preserve specific IOPS when data disk is configured with valid IOPS', async () => {
        const inputWithSpecificIops: ScalewayInstanceInput = {
            ...TEST_INPUT,
            provision: {
                ...TEST_INPUT.provision,
                dataDiskSizeGb: 100,
                dataDiskIops: 15000
            }
        }
        
        sandbox.stub(ScalewayClient.prototype, 'listIopsTiers').resolves(TEST_IOPS_TIERS)

        const result = await new ScalewayInputPrompter({ coreConfig: coreConfig }).promptInput(inputWithSpecificIops, { autoApprove: true })

        strictEqual(result.provision.dataDiskSizeGb, 100)
        strictEqual(result.provision.dataDiskIops, 15000)
        strictEqual(result.provision.diskSizeGb, TEST_INPUT.provision.diskSizeGb)
        strictEqual(result.provision.instanceType, TEST_INPUT.provision.instanceType)
    })

    it('should not configure IOPS when no data disk is requested', async () => {
        const inputWithoutDataDisk: ScalewayInstanceInput = {
            ...TEST_INPUT,
            provision: {
                ...TEST_INPUT.provision,
                dataDiskSizeGb: 0,
                dataDiskIops: undefined
            }
        }

        const result = await new ScalewayInputPrompter({ coreConfig: coreConfig }).promptInput(inputWithoutDataDisk, { autoApprove: true })

        strictEqual(result.provision.dataDiskSizeGb, 0)
        strictEqual(result.provision.dataDiskIops, undefined)
        strictEqual(result.provision.diskSizeGb, TEST_INPUT.provision.diskSizeGb)
        strictEqual(result.provision.instanceType, TEST_INPUT.provision.instanceType)
    })

    it('should use default IOPS when missing and data disk is requested (autoApprove)', async () => {
        const inputMissingIops: ScalewayInstanceInput = {
            ...TEST_INPUT,
            provision: {
                ...TEST_INPUT.provision,
                dataDiskSizeGb: 50,
                dataDiskIops: undefined
            }
        }

        sandbox.stub(ScalewayClient.prototype, 'listIopsTiers').resolves(TEST_IOPS_TIERS)

        const result = await new ScalewayInputPrompter({ coreConfig: coreConfig }).promptInput(inputMissingIops, { autoApprove: true })

        strictEqual(result.provision.dataDiskSizeGb, 50)
        strictEqual(result.provision.dataDiskIops, 5000) // First tier as default
    })

    it('should use fallback IOPS when API fails and data disk requested (autoApprove)', async () => {
        const inputMissingIops: ScalewayInstanceInput = {
            ...TEST_INPUT,
            provision: {
                ...TEST_INPUT.provision,
                dataDiskSizeGb: 50,
                dataDiskIops: undefined
            }
        }

        sandbox.stub(ScalewayClient.prototype, 'listIopsTiers').rejects(new Error('API Error'))

        const result = await new ScalewayInputPrompter({ coreConfig: coreConfig }).promptInput(inputMissingIops, { autoApprove: true })

        strictEqual(result.provision.dataDiskSizeGb, 50)
        strictEqual(result.provision.dataDiskIops, 5000) // First fallback tier as default
    })

    it('should handle invalid IOPS by falling back to first available tier', async () => {
        const inputWithInvalidIops: ScalewayInstanceInput = {
            ...TEST_INPUT,
            provision: {
                ...TEST_INPUT.provision,
                dataDiskSizeGb: 100,
                dataDiskIops: 9999
            }
        }

        sandbox.stub(ScalewayClient.prototype, 'listIopsTiers').resolves(TEST_IOPS_TIERS)

        const result = await new ScalewayInputPrompter({ coreConfig: coreConfig }).promptInput(inputWithInvalidIops, { autoApprove: true })

        strictEqual(result.provision.dataDiskSizeGb, 100)
        strictEqual(result.provision.dataDiskIops, TEST_IOPS_TIERS[0])
    })

    it('should ignore IOPS when no data disk is requested', async () => {
        const inputWithIopsButNoDataDisk: ScalewayInstanceInput = {
            ...TEST_INPUT,
            provision: {
                ...TEST_INPUT.provision,
                dataDiskSizeGb: 0,
                dataDiskIops: 15000
            }
        }

        sandbox.stub(ScalewayClient.prototype, 'listIopsTiers').resolves(TEST_IOPS_TIERS)

        const result = await new ScalewayInputPrompter({ coreConfig: coreConfig }).promptInput(inputWithIopsButNoDataDisk, { autoApprove: true })

        strictEqual(result.provision.dataDiskSizeGb, 0)
        strictEqual(result.provision.dataDiskIops, undefined)
    })

    it('should handle invalid IOPS with immediate fallback (no prompting)', async () => {
        const inputWithInvalidIops: ScalewayInstanceInput = {
            ...TEST_INPUT,
            provision: {
                ...TEST_INPUT.provision,
                dataDiskSizeGb: 100,
                dataDiskIops: 8888 // Invalid IOPS value
            }
        }

        sandbox.stub(ScalewayClient.prototype, 'listIopsTiers').resolves(TEST_IOPS_TIERS)

        const result = await new ScalewayInputPrompter({ coreConfig: coreConfig }).promptInput(inputWithInvalidIops, { autoApprove: true })

        strictEqual(result.provision.dataDiskSizeGb, 100)
        strictEqual(result.provision.dataDiskIops, 5000) // Falls back to first available tier
        strictEqual(result.provision.diskSizeGb, TEST_INPUT.provision.diskSizeGb)
        strictEqual(result.provision.instanceType, TEST_INPUT.provision.instanceType)
    })

    it('should use default IOPS when missing with data disk (autoApprove: false would prompt)', async () => {
        const inputMissingIops: ScalewayInstanceInput = {
            ...TEST_INPUT,
            provision: {
                ...TEST_INPUT.provision,
                dataDiskSizeGb: 50,
                dataDiskIops: undefined
            }
        }

        sandbox.stub(ScalewayClient.prototype, 'listIopsTiers').resolves(TEST_IOPS_TIERS)

        // Test autoApprove: true (no prompting)
        const result = await new ScalewayInputPrompter({ coreConfig: coreConfig }).promptInput(inputMissingIops, { autoApprove: true })

        strictEqual(result.provision.dataDiskSizeGb, 50)
        strictEqual(result.provision.dataDiskIops, 5000) // Uses first tier as default
    })
})
