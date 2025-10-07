/**
 * Input normalization utilities for handling dirty inputs consistently
 * Applied at boundaries before validation to ensure clean data
 */

export interface NormalizationOptions {
  trimWhitespace: boolean;
  lowercaseRegions: boolean;
  lowercaseZones: boolean;  
  removeExtraSpaces: boolean;
}

export const DEFAULT_NORMALIZATION: NormalizationOptions = {
  trimWhitespace: true,
  lowercaseRegions: true,
  lowercaseZones: true,
  removeExtraSpaces: true,
};

/**
 * Normalizes raw input before validation
 * Handles common user input mistakes consistently
 */
export function normalizeScalewayInput(
  rawInput: Record<string, unknown>, 
  options: NormalizationOptions = DEFAULT_NORMALIZATION
): Record<string, unknown> {
  const normalized: Record<string, unknown> = {};
  
  for (const [key, value] of Object.entries(rawInput)) {
    if (typeof value === 'string') {
      let cleanValue = value;
      
      if (options.trimWhitespace) {
        cleanValue = cleanValue.trim();
      }
      
      if (options.removeExtraSpaces) {
        cleanValue = cleanValue.replace(/\s+/g, ' ');
      }
      
      // Scaleway-specific normalization
      if ((key === 'region' && options.lowercaseRegions) ||
          (key === 'zone' && options.lowercaseZones)) {
        cleanValue = cleanValue.toLowerCase();
      }
      
      normalized[key] = cleanValue;
    } else {
      // Non-string values pass through unchanged
      normalized[key] = value;
    }
  }
  
  return normalized;
}