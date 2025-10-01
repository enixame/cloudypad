import * as assert from 'assert';
import sinon from 'sinon';
import * as prompts from '@inquirer/prompts';
import { ScalewayCreateCliArgs, ScalewayInputPrompter } from '../../../../src/providers/scaleway/cli';
import { DEFAULT_COMMON_CLI_ARGS, DEFAULT_COMMON_INPUT, getUnitTestCoreConfig } from '../../utils';
import { PartialDeep } from 'type-fest';
import lodash from 'lodash';
import { ScalewayInstanceInput } from '../../../../src/providers/scaleway/state';
import { ScalewayClient } from '../../../../src/providers/scaleway/sdk-client';

describe('Scaleway input prompter', () => {

    const instanceName = "scaleway-dummy"
    const coreConfig = getUnitTestCoreConfig()

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
            dataDiskIops: 5000,
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
        assert.deepEqual(result, TEST_INPUT)
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
        
        assert.deepEqual(result, expected)
    })

    it('should allow selecting 5000 IOPS for data disk when prompted', async () => {
        // Arrange: ensure only the IOPS prompt is triggered
        const inputWithoutIops: ScalewayInstanceInput = lodash.cloneDeep(TEST_INPUT)
        // dataDiskIops intentionally undefined to trigger the prompt
        // Stub tiers discovery and prompt selection
        const tiersStub = sinon.stub(ScalewayClient.prototype, 'listIopsTiers').resolves([5000, 15000])
        const selectStub = sinon.stub(prompts, 'select').resolves(5000 as unknown as never)

        try {
            // Act
            const result = await new ScalewayInputPrompter({ coreConfig: coreConfig }).promptInput(inputWithoutIops, { autoApprove: true })

            // Assert
            assert.strictEqual(result.provision.dataDiskIops, 5000)
            // Other fields should remain unchanged
            const expected: ScalewayInstanceInput = lodash.merge({}, TEST_INPUT, { provision: { dataDiskIops: 5000 } })
            assert.deepEqual(result, expected)
        } finally {
            tiersStub.restore()
            selectStub.restore()
        }
    })
})
