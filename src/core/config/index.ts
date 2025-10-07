/**
 * Core configuration module for Cloudy Pad
 * 
 * @description Provides configuration management for the Cloudy Pad platform including
 * state backend configuration, Pulumi settings, and environment-based configuration loading.
 */

export { CoreConfig, CoreConfigSchema } from './interface'
export { ConfigLoader, DEFAULT_CORE_CONFIG } from './default'

// Re-export commonly used types and constants
export type { PUBLIC_IP_TYPE } from '../const'
export {
  PUBLIC_IP_TYPE_STATIC,
  PUBLIC_IP_TYPE_DYNAMIC,
  CLOUDYPAD_VERSION
} from '../const'