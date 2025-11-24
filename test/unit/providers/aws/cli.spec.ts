import * as assert from 'assert';
import { AwsInstanceInput } from '../../../../src/providers/aws/state';
import { PUBLIC_IP_TYPE_STATIC } from '../../../../src/core/const';
import { DEFAULT_COMMON_INPUT, DEFAULT_COMMON_CLI_ARGS, getUnitTestCoreConfig } from "../../utils";
import { AwsCreateCliArgs, AwsInputPrompter } from '../../../../src/providers/aws/cli';
import lodash from 'lodash'
import { PartialDeep } from 'type-fest';

describe('AWS input prompter', () => {

    const instanceName = "aws-dummy"
    const coreConfig = getUnitTestCoreConfig()

    const TEST_INPUT: AwsInstanceInput = {
        instanceName: instanceName,
        provision: {
            ...DEFAULT_COMMON_INPUT.provision,
            instanceType: "g5.2xlarge",
            rootDiskSizeGb: 20,
            dataDiskSizeGb: 200,
            dataDiskIops: 3000, // Standard profile
            dataDiskThroughput: 125, // Standard profile
            publicIpType: PUBLIC_IP_TYPE_STATIC,
            region: "us-west-2",
            useSpot: true,
            costAlert: {
                limit: 999,
                notificationEmail: "dummy@crafteo.io",
            }
        },
        configuration: {
            ...DEFAULT_COMMON_INPUT.configuration
        }
    }

    const TEST_CLI_ARGS: AwsCreateCliArgs = {
        ...DEFAULT_COMMON_CLI_ARGS,
        name: instanceName,
        rootDiskSize: TEST_INPUT.provision.rootDiskSizeGb,
        dataDiskSize: TEST_INPUT.provision.dataDiskSizeGb,
        publicIpType: TEST_INPUT.provision.publicIpType,
        instanceType: TEST_INPUT.provision.instanceType,
        region: TEST_INPUT.provision.region,
        spot: TEST_INPUT.provision.useSpot,
        costLimit: TEST_INPUT.provision.costAlert?.limit,
        costNotificationEmail: TEST_INPUT.provision.costAlert?.notificationEmail,
    }

    it('should return provided inputs without prompting when full input provider', async () => {
        const result = await new AwsInputPrompter({ coreConfig: coreConfig }).promptInput(TEST_INPUT, { autoApprove: true })
        assert.deepEqual(result, TEST_INPUT)
    })

    it('should convert CLI args into partial input', () => {
        const prompter = new AwsInputPrompter({ coreConfig: coreConfig })
        const result = prompter.cliArgsIntoPartialInput(TEST_CLI_ARGS)

        const expected: PartialDeep<AwsInstanceInput> = {
            instanceName: TEST_INPUT.instanceName,
            provision: {
                ssh: lodash.omit(TEST_INPUT.provision.ssh, "user"),
                instanceType: TEST_INPUT.provision.instanceType,
                rootDiskSizeGb: TEST_INPUT.provision.rootDiskSizeGb,
                dataDiskSizeGb: TEST_INPUT.provision.dataDiskSizeGb,
                publicIpType: TEST_INPUT.provision.publicIpType,
                region: TEST_INPUT.provision.region,
                useSpot: TEST_INPUT.provision.useSpot,
                costAlert: {
                    limit: 999,
                    notificationEmail: "dummy@crafteo.io",
                },
            },
            configuration: {
                ...TEST_INPUT.configuration,
                // cliArgsIntoPartialInput will leave wolf as undefined when streamingServer is sunshine
                wolf: undefined
            }
        }
        
        assert.deepEqual(result, expected)
    })
})
    

