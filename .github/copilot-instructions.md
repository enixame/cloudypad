# Copilot Instructions (repo)
- Toujours préférer TypeScript strict (voir tsconfig).
- Interdire `any` sauf commentaire `// @justification`.
- Unions discriminées + exhaustivité; `unknown` + narrowing.
- Proposer diff minimal pour chaque correction.
- Tests: couvrir invariants/erreurs; éviter mocks profonds.
- Front: tree-shaking, code-splitting; Node: pas d'I/O sync dans hot path.

# Cloudy Pad - AI Coding Agent Instructions

## Architecture Overview

Cloudy Pad is a **cloud gaming infrastructure provisioning platform** that deploys streaming servers (Sunshine/Wolf) across multiple cloud providers. The core follows a **Provider-Provisioner-Runner pattern**:

- **Provider**: Abstract interface (`src/core/provider.ts`) - each cloud provider implements `AbstractProviderClient<StateType>`
- **Provisioner**: Infrastructure deployment via Pulumi (`src/core/provisioner.ts`) - provisions cloud resources
- **Runner**: Instance lifecycle management (`src/core/runner.ts`) - start/stop/restart operations
- **Manager**: Orchestrates the full lifecycle (`src/core/manager.ts`) - deploy, configure, destroy instances
- **Configurator**: Post-provision setup via Ansible (`src/configurators/ansible.ts`) - installs gaming software

## Development Environment

**Critical**: Always run commands within Nix development shell:
```bash
# Instead of: npm test
nix develop -c npm test

# Task-based workflow (preferred):
nix develop -c task test-unit
nix develop -c task test-compile
```

Key commands from `Taskfile.yml`:
- `task test-unit` - Run unit tests with Mocha
- `task test-compile` - TypeScript compilation check
- `task test-integ-provider-<name>` - Integration tests for specific providers
- `task build-npm` - Build distribution package

## Multi-Cloud Provider Pattern

Each provider follows identical structure in `src/providers/<name>/`:
- `provider.ts` - Implements `AbstractProviderClient<StateType>`
- `provisioner.ts` - Extends `AbstractInstanceProvisioner` using Pulumi
- `runner.ts` - Provider-specific start/stop logic
- `state.ts` - Zod schemas for input/output validation
- `pulumi.ts` - Infrastructure-as-code definitions
- `factory.ts` - Creates provisioner/runner instances

**Adding new providers**: Follow the checklist in `docs/src/contributing/development-guide.md` - requires Pulumi stack, state schemas, CLI integration, and test coverage.

## Pulumi Integration Pattern

Infrastructure provisioning uses **Pulumi Automation API**:
```typescript
// Standard pattern in all provisioners:
const pulumiClient = new ProviderPulumiClient({
    stackName: this.args.instanceName,
    workspaceOptions: this.args.coreConfig.pulumi?.workspaceOptions
})
await pulumiClient.setConfig(stackConfig)  
const outputs = await pulumiClient.up()
```

Each provider's Pulumi program (`*PulumiProgram()`) defines infrastructure using provider-specific resources, returning standardized outputs for hostname, instance IDs, and disk information.

## State Management

**Zod-based schemas** in `src/core/state/state.ts` ensure type safety:
- `CommonProvisionInputV1Schema` - Base input validation
- `CommonProvisionOutputV1Schema` - Standard outputs (host, publicIPv4, dataDiskId)
- Provider-specific schemas extend these base schemas

State persists locally or in S3, parsed by `GenericStateParser` implementations per provider.

## Testing Strategy

- **Unit tests**: `test/unit/` with Mocha configuration in `.mocharc.json`
- **Integration tests**: `test/integ/` - real provider deployments (expensive, use sparingly)
- **Pulumi tests**: `test/integ/unstable/pulumi/` - infrastructure validation
- **CLI tests**: Full lifecycle testing in `test/integ/cli-full-lifecycle/`

## Key Conventions

- **Error handling**: Use structured logging via `getLogger()` from `src/log/utils.ts`
- **Retries**: `Retrier` class in `src/tools/retrier.ts` for resilient operations
- **State validation**: Always use Zod schemas, never plain TypeScript interfaces for external data
- **Provider registration**: Add new providers to `src/core/const.ts` and `src/core/manager-builder.ts`
- **Ansible integration**: Gaming software setup happens post-provision via `ansible/` playbooks

## CLI Architecture

CLI entry point: `src/cli/main.ts` → `src/cli/program.ts`
- Commands map to provider operations via `src/cli/command.ts`
- Interactive prompts in `src/cli/prompter.ts` for user input collection
- Each provider has CLI integration in `src/providers/<name>/cli.ts`

**Snapshot operations** (Scaleway-specific feature) follow pattern: create/restore with cost optimization flags (`--delete-old-disk`, `--delete-data-disk`).

## Code Quality

- **ESLint**: Configuration in `eslint.config.mjs`
- **TypeScript strict mode**: All providers must maintain type safety
- **Circular dependency checks**: `task test-circular-deps` using Madge
- **No direct tool execution**: Always use Nix shell or tasks - never create temporary test files

Focus on the **provider abstraction pattern** when adding features - ensure new functionality works consistently across all cloud providers through the common interfaces.