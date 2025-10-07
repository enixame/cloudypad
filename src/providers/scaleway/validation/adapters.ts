/**
 * Schema migration adapters for backward compatibility
 * Handles transformation between different schema versions
 */

import type { SchemaVersion } from './versioning'

export interface MigrationContext {
  fromVersion: SchemaVersion;
  toVersion: SchemaVersion;
  originalInput: unknown;
  logger?: (message: string, data?: unknown) => void;
}

export interface SchemaAdapter {
  fromVersion: SchemaVersion;
  toVersion: SchemaVersion;
  migrate(input: unknown, context: MigrationContext): unknown;
  isApplicable(context: MigrationContext): boolean;
}

/**
 * Registry of all available schema adapters
 */
class AdapterRegistry {
  private adapters: Map<string, SchemaAdapter> = new Map();

  register(adapter: SchemaAdapter): void {
    const key = `${adapter.fromVersion}->${adapter.toVersion}`;
    this.adapters.set(key, adapter);
  }

  findAdapter(fromVersion: SchemaVersion, toVersion: SchemaVersion): SchemaAdapter | undefined {
    const key = `${fromVersion}->${toVersion}`;
    return this.adapters.get(key);
  }

  getAllAdapters(): SchemaAdapter[] {
    return Array.from(this.adapters.values());
  }
}

export const adapterRegistry = new AdapterRegistry();

/**
 * Example future adapter: v1 → v2 migration
 * This demonstrates how to handle breaking changes gracefully
 */
/*
const v1ToV2Adapter: SchemaAdapter = {
  fromVersion: 'v1',
  toVersion: 'v2',
  
  isApplicable(context: MigrationContext): boolean {
    return context.fromVersion === 'v1' && context.toVersion === 'v2';
  },
  
  migrate(
    rawInput: unknown,
    context: MigrationContext,
  ): unknown {
    const input = rawInput as Record<string, unknown>;
    const migrated = { ...input };
    
    // Example migration: handle old region format → new format
    if (typeof input.region === 'string') {
      const region = input.region;
      // Hypothetical v2 migration: fr-par → europe-france-paris
      if (region === 'fr-par') {
        migrated.region = 'europe-france-paris';
      }
    }
    
    return migrated;
  },
};

// Register the example adapter when v2 is needed:
// adapterRegistry.register(v1ToV2Adapter);
*/

// Register the example adapter (commented out until v2 is needed)
// adapterRegistry.register(v1ToV2Adapter);

/**
 * Migrate input from one schema version to another
 */
export function migrateSchema(
  input: unknown,
  fromVersion: SchemaVersion,
  toVersion: SchemaVersion,
  logger?: (message: string, data?: unknown) => void
): unknown {
  if (fromVersion === toVersion) {
    return input; // No migration needed
  }
  
  const context: MigrationContext = {
    fromVersion,
    toVersion,
    originalInput: input,
    logger,
  };
  
  const adapter = adapterRegistry.findAdapter(fromVersion, toVersion);
  if (!adapter) {
    throw new Error(`No migration adapter found for ${fromVersion} → ${toVersion}`);
  }
  
  if (!adapter.isApplicable(context)) {
    throw new Error(`Adapter ${fromVersion} → ${toVersion} is not applicable to current input`);
  }
  
  return adapter.migrate(input, context);
}

/**
 * Get available migration paths from a version
 */
export function getAvailableMigrations(fromVersion: SchemaVersion): SchemaVersion[] {
  return adapterRegistry
    .getAllAdapters()
    .filter(adapter => adapter.fromVersion === fromVersion)
    .map(adapter => adapter.toVersion);
}

/**
 * Check if migration is possible between versions
 */
export function canMigrate(fromVersion: SchemaVersion, toVersion: SchemaVersion): boolean {
  return adapterRegistry.findAdapter(fromVersion, toVersion) !== undefined;
}