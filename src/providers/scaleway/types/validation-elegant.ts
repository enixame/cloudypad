/**
 * Elegant validation schemas for Scaleway provider
 * Provides clean, type-safe validation with branded types
 */

import { z } from 'zod';
import type { 
  ScalewayProjectId, 
  ScalewayRegion, 
  ScalewayZone
} from './branded';
import { getDefaultValidationConfig, type ValidationConfig } from '../validation';

// Re-export branded types for convenience
export type { 
  ScalewayProjectId, 
  ScalewayRegion, 
  ScalewayZone,
  ScalewayCommercialType 
} from './branded';

/**
 * Base schema for Scaleway client arguments
 */
export const ScalewayClientArgsSchema = z.object({
  projectId: z.string().uuid().brand<ScalewayProjectId>(),
  region: z.string().min(1).brand<ScalewayRegion>(),
  zone: z.string().min(1).brand<ScalewayZone>(),
  organizationId: z.string().uuid().optional(),
  accessKey: z.string().optional(),
  secretKey: z.string().optional(),
});

export type ScalewayClientArgs = z.infer<typeof ScalewayClientArgsSchema>;

/**
 * Validate Scaleway client arguments with configuration
 */
export function validateScalewayClientArgs(
  input: unknown,
  _config: ValidationConfig = getDefaultValidationConfig()
): ScalewayClientArgs {
  const result = ScalewayClientArgsSchema.parse(input);
  
  // Return the parsed and validated result
  return result;
}

/**
 * Safe validation that returns undefined on error
 */
export function safeValidateScalewayClientArgs(
  input: unknown,
  config: ValidationConfig = getDefaultValidationConfig()
): ScalewayClientArgs | undefined {
  try {
    return validateScalewayClientArgs(input, config);
  } catch {
    return undefined;
  }
}