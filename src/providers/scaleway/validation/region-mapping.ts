/**
 * Centralized region mapping logic for Scaleway
 * Single source of truth for zone-region relationships
 * Handles provider naming changes and future evolution
 */

export interface RegionMapping {
  version: string;
  lastUpdated: string;
  mappings: Record<string, string>;
}

/**
 * Current region mapping (v1)
 * This centralizes the logic in case Scaleway changes their naming convention
 */
export const CURRENT_REGION_MAPPING: RegionMapping = {
  version: 'v1',
  lastUpdated: '2025-10-07',
  mappings: {
    // Europe regions
    'fr-par-1': 'fr-par',
    'fr-par-2': 'fr-par',
    'fr-par-3': 'fr-par',
    'nl-ams-1': 'nl-ams',
    'nl-ams-2': 'nl-ams',
    'nl-ams-3': 'nl-ams',
    'pl-waw-1': 'pl-waw',
    'pl-waw-2': 'pl-waw',
    'pl-waw-3': 'pl-waw',
    
    // Future regions can be added here without breaking existing code
    // 'de-fra-1': 'de-fra',  // Germany Frankfurt
    // 'uk-lon-1': 'uk-lon',  // UK London
  },
};

/**
 * Extract region from zone using centralized mapping
 * This is the single source of truth for zone→region conversion
 */
export function zoneToRegion(zone: string): string {
  // First try exact mapping (for special cases or overrides)
  const exactMatch = CURRENT_REGION_MAPPING.mappings[zone];
  if (exactMatch) {
    return exactMatch;
  }
  
  // Extract region from zone (fr-par-1 → fr-par)
  const standardRegion = zone.replace(/-\d+$/, '');
  
  // Validate that the result looks like a region
  if (!/^[a-z]{2}-[a-z]{3}$/.test(standardRegion)) {
    throw new Error(`Cannot derive region from zone: ${zone}`);
  }
  
  return standardRegion;
}

/**
 * Get all supported zones for a given region
 */
export function getZonesForRegion(region: string): string[] {
  return Object.keys(CURRENT_REGION_MAPPING.mappings)
    .filter(zone => CURRENT_REGION_MAPPING.mappings[zone] === region);
}

/**
 * Get all supported regions
 */
export function getAllSupportedRegions(): string[] {
  const regions = new Set(Object.values(CURRENT_REGION_MAPPING.mappings));
  return Array.from(regions).sort();
}

/**
 * Get all supported zones
 */
export function getAllSupportedZones(): string[] {
  return Object.keys(CURRENT_REGION_MAPPING.mappings).sort();
}

/**
 * Validate zone-region consistency using centralized mapping
 */
export function validateZoneRegionConsistency(zone: string, region: string): boolean {
  try {
    const expectedRegion = zoneToRegion(zone);
    return expectedRegion === region;
  } catch {
    return false; // Invalid zone format
  }
}

/**
 * Future: Handle provider naming changes
 * This function allows for smooth transitions when Scaleway changes naming
 */
export function migrateRegionNaming(
  oldRegion: string,
  fromVersion: string,
  toVersion: string
): string {
  // Example: if Scaleway changes fr-par → europe-france-paris
  if (fromVersion === 'v1' && toVersion === 'v2') {
    const v1ToV2Migration: Record<string, string> = {
      'fr-par': 'europe-france-paris',
      'nl-ams': 'europe-netherlands-amsterdam',
      'pl-waw': 'europe-poland-warsaw',
    };
    return v1ToV2Migration[oldRegion] || oldRegion;
  }
  
  // No migration needed or unsupported migration
  return oldRegion;
}

/**
 * Get mapping metadata for debugging/monitoring
 */
export function getMappingInfo(): RegionMapping {
  return { ...CURRENT_REGION_MAPPING }; // Return copy to prevent mutations
}