/**
 * Schema versioning system for Scaleway validation
 * Ensures backward compatibility when validation rules evolve
 */

export type SchemaVersion = 'v1' | 'v2';

export interface VersionedValidationConfig {
  version: SchemaVersion;
  enableAutoMigration: boolean;
  strictVersionCheck: boolean;
}

export const DEFAULT_VERSIONED_CONFIG: VersionedValidationConfig = {
  version: 'v1', // Current stable version
  enableAutoMigration: true,
  strictVersionCheck: false, // Allow older versions by default
};

/**
 * Schema evolution metadata
 */
export interface SchemaEvolution {
  version: SchemaVersion;
  description: string;
  breakingChanges: string[];
  addedFeatures: string[];
}

export const SCHEMA_EVOLUTION_HISTORY: SchemaEvolution[] = [
  {
    version: 'v1',
    description: 'Initial branded types with zone-region consistency',
    breakingChanges: [],
    addedFeatures: [
      'Branded types for type safety',
      'Zone-region consistency validation',
      'Commercial type regex validation',
    ],
  },
  // Future v2 example:
  // {
  //   version: 'v2',
  //   description: 'Extended region patterns and new commercial types',
  //   breakingChanges: [
  //     'New region naming convention (continent-country-city)',
  //   ],
  //   addedFeatures: [
  //     'Multi-continent region support',
  //     'New GPU commercial types',
  //     'Edge location zones',
  //   ],
  // },
];

/**
 * Get the latest stable schema version
 */
export function getLatestSchemaVersion(): SchemaVersion {
  return SCHEMA_EVOLUTION_HISTORY[SCHEMA_EVOLUTION_HISTORY.length - 1].version;
}

/**
 * Check if a version is supported
 */
export function isSupportedVersion(version: SchemaVersion): boolean {
  return SCHEMA_EVOLUTION_HISTORY.some(evolution => evolution.version === version);
}

/**
 * Get evolution info for a specific version
 */
export function getVersionInfo(version: SchemaVersion): SchemaEvolution | undefined {
  return SCHEMA_EVOLUTION_HISTORY.find(evolution => evolution.version === version);
}