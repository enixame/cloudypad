/**
 * Type Guards for Test Helpers
 * Provides type-safe validation for test state objects
 */

export interface StateWithProvider {
  provision: {
    provider: string
  }
}

export interface StateWithVersion {
  version: string
}

export interface StateWithName {
  name: string
}

export interface StateWithSnapshot {
  snapshot: {
    name: string
    deleteOldDisk?: boolean
    deleteDataDisk?: boolean
  }
}

/**
 * Type guard to check if an object has a provider field
 */
export function hasProvider(obj: unknown): obj is StateWithProvider {
  if (typeof obj !== 'object' || obj === null || !('provision' in obj)) {
    return false
  }
  
  const candidate = obj as Record<string, unknown>
  const provision = candidate.provision
  
  return (
    typeof provision === 'object' &&
    provision !== null &&
    'provider' in provision &&
    typeof (provision as Record<string, unknown>).provider === 'string'
  )
}

/**
 * Type guard to check if an object has a version field
 */
export function hasVersion(obj: unknown): obj is StateWithVersion {
  return (
    typeof obj === 'object' &&
    obj !== null &&
    'version' in obj &&
    typeof (obj as Record<string, unknown>).version === 'string'
  )
}

/**
 * Type guard to check if an object has a name field
 */
export function hasName(obj: unknown): obj is StateWithName {
  return (
    typeof obj === 'object' &&
    obj !== null &&
    'name' in obj &&
    typeof (obj as Record<string, unknown>).name === 'string'
  )
}

/**
 * Type guard to check if an object has snapshot configuration
 */
export function hasSnapshot(obj: unknown): obj is StateWithSnapshot {
  if (typeof obj !== 'object' || obj === null || !('snapshot' in obj)) {
    return false
  }
  
  const candidate = obj as Record<string, unknown>
  const snapshot = candidate.snapshot
  
  return (
    typeof snapshot === 'object' &&
    snapshot !== null &&
    'name' in snapshot &&
    typeof (snapshot as Record<string, unknown>).name === 'string'
  )
}

/**
 * Safe getter for provider name
 */
export function getProvider(state: unknown): string {
  if (hasProvider(state)) {
    return state.provision.provider
  }
  return 'unknown'
}

/**
 * Safe getter for version
 */
export function getVersion(state: unknown): string {
  if (hasVersion(state)) {
    return state.version
  }
  return 'unknown'
}

/**
 * Safe getter for name
 */
export function getName(state: unknown): string {
  if (hasName(state)) {
    return state.name
  }
  return 'unknown'
}