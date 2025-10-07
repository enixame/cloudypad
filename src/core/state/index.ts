/**
 * Core state management module for Cloudy Pad
 * 
 * @description Provides state management functionality including parsing, loading,
 * writing, and validation of provider states across all supported cloud platforms.
 */

export * from './state'
export * from './parser'
export * from './loader'
export * from './writer'
export * from './builders'
export * from './initializer'

// Type aliases for compatibility
import { InstanceStateV1 } from './state'
import { GenericStateParser } from './parser'

export type StateParser<S extends InstanceStateV1> = GenericStateParser<S>

// Re-export validation schemas from state
export {
  CommonProvisionInputV1Schema,
  CommonProvisionOutputV1Schema,
  type CommonProvisionInputV1,
  type CommonProvisionOutputV1
} from './state'