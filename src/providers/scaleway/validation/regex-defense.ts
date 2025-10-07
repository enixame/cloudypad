/**
 * Regex patterns with ReDoS protection
 * Pre-compiled patterns with linear complexity and input size guards
 */

// Input size limits for DoS protection
export const INPUT_SIZE_LIMITS = {
  MAX_GENERAL_INPUT: 128,        // General string inputs
  MAX_PROJECT_ID: 64,           // UUID length + margin
  MAX_REGION_ZONE: 32,          // fr-par, fr-par-1 + margin
  MAX_COMMERCIAL_TYPE: 64,      // GPU3-S, L4-1-24G + margin
} as const;

/**
 * Pre-compiled regex patterns - linear complexity only
 * Avoid nested quantifiers and catastrophic backtracking
 */
export const COMPILED_PATTERNS = {
  // Linear patterns only - no nested quantifiers
  UUID: /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
  REGION: /^[a-z]{2}-[a-z]{3}$/,                    // Exact: fr-par
  ZONE: /^[a-z]{2}-[a-z]{3}-[0-9]+$/,              // Exact: fr-par-1
  COMMERCIAL_TYPE: /^[A-Z0-9]+(?:-[A-Z0-9]+)*$/,   // Linear: GPU3-S, L4-1-24G
} as const;

/**
 * Safe input guard - protects against large inputs before regex execution
 */
export function guardInputSize<T extends string>(
  input: T, 
  maxSize: number, 
  field: string
): T {
  if (input.length > maxSize) {
    throw new Error(`Input too large for ${field}: ${input.length} > ${maxSize} chars`);
  }
  return input;
}

/**
 * Safe regex test with input size protection
 */
export function safeRegexTest(
  pattern: RegExp, 
  input: string, 
  maxSize: number, 
  field: string
): boolean {
  guardInputSize(input, maxSize, field);
  return pattern.test(input);
}

/**
 * Validate UUID with ReDoS protection
 */
export function validateUUID(input: string): boolean {
  return safeRegexTest(
    COMPILED_PATTERNS.UUID, 
    input, 
    INPUT_SIZE_LIMITS.MAX_PROJECT_ID, 
    'projectId'
  );
}

/**
 * Validate region with ReDoS protection
 */
export function validateRegion(input: string): boolean {
  return safeRegexTest(
    COMPILED_PATTERNS.REGION, 
    input, 
    INPUT_SIZE_LIMITS.MAX_REGION_ZONE, 
    'region'
  );
}

/**
 * Validate zone with ReDoS protection
 */
export function validateZone(input: string): boolean {
  return safeRegexTest(
    COMPILED_PATTERNS.ZONE, 
    input, 
    INPUT_SIZE_LIMITS.MAX_REGION_ZONE, 
    'zone'
  );
}

/**
 * Validate commercial type with ReDoS protection
 */
export function validateCommercialType(input: string): boolean {
  return safeRegexTest(
    COMPILED_PATTERNS.COMMERCIAL_TYPE, 
    input, 
    INPUT_SIZE_LIMITS.MAX_COMMERCIAL_TYPE, 
    'commercialType'
  );
}