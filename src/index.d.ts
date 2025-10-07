/**
 * Cloudypad - Cloud Gaming Infrastructure Provisioning
 * Main entry point for the package
 */
export { InstanceManager } from "./core/manager";
export { CloudypadClient } from "./core/client";
export { InstanceInitializer } from "./core/initializer";
export type { ScalewayProjectId, ScalewayRegion, ScalewayZone, ScalewayCommercialType, ScalewayClientArgs } from './providers/scaleway/types/branded';
export type { ValidationConfig, ValidationMode, ValidationLogger, SchemaVersion } from './providers/scaleway/validation';
export { getDefaultValidationConfig, consoleValidationLogger, silentValidationLogger, getLatestSchemaVersion } from './providers/scaleway/validation';
export { ScalewayClient } from './providers/scaleway/sdk-client';
