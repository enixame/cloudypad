/**
 * Example integration of error taxonomy in Scaleway validation
 * Shows practical usage patterns for the new error system
 */

import { z } from 'zod';
import {
  ErrorCategory,
  ErrorSeverity,
  ErrorEnvironment,
  ValidationError,
  createError,
  type ErrorCode
} from '../src/core/errors/taxonomy';

// Define specific error codes for this example
const EXAMPLE_ERROR_CODES = {
  INVALID_SCALEWAY_CONFIG: {
    code: 'EXAMPLE_INVALID_SCALEWAY_CONFIG',
    category: ErrorCategory.VALIDATION,
    severity: ErrorSeverity.ERROR,
    devMessage: 'Scaleway configuration validation failed: projectId must be UUID, region must be supported (fr-par, nl-ams, pl-waw)',
    prodMessage: 'Invalid Scaleway configuration',
    possibleCauses: [
      'Project ID format is incorrect',
      'Region is not supported',
      'Required fields are missing'
    ],
    suggestions: [
      'Check your project ID in Scaleway console',
      'Use supported regions: fr-par, nl-ams, pl-waw',
      'Ensure all required fields are provided'
    ],
    docsUrl: 'https://cloudypad.dev/docs/providers/scaleway'
  } as ErrorCode
};

// Example Zod schema with error handling
const ScalewayConfigSchema = z.object({
  projectId: z.string().uuid('Project ID must be a valid UUID'),
  region: z.enum(['fr-par', 'nl-ams', 'pl-waw'], {
    errorMap: () => ({ message: 'Region must be one of: fr-par, nl-ams, pl-waw' })
  }),
  zone: z.string().min(1, 'Zone is required')
});

/**
 * Enhanced validation function with structured error handling
 */
export function validateScalewayConfig(
  input: unknown,
  environment: ErrorEnvironment = ErrorEnvironment.DEVELOPMENT
): z.infer<typeof ScalewayConfigSchema> {
  try {
    return ScalewayConfigSchema.parse(input);
  } catch (error) {
    if (error instanceof z.ZodError) {
      // Convert Zod error to structured CloudyPad error
      const context = {
        validationErrors: error.issues.map(issue => ({
          path: issue.path.join('.'),
          message: issue.message,
          code: issue.code
        })),
        inputReceived: typeof input === 'object' ? Object.keys(input || {}) : typeof input
      };

      throw createError(
        EXAMPLE_ERROR_CODES.INVALID_SCALEWAY_CONFIG,
        context,
        error,
        environment
      );
    }
    
    // Re-throw other errors as-is
    throw error;
  }
}

/**
 * Example usage with error handling
 */
export function exampleUsage(): void {
  const testInputs = [
    // Valid input
    { projectId: '12345678-1234-1234-1234-123456789abc', region: 'fr-par', zone: 'fr-par-1' },
    
    // Invalid project ID
    { projectId: 'invalid-uuid', region: 'fr-par', zone: 'fr-par-1' },
    
    // Invalid region
    { projectId: '12345678-1234-1234-1234-123456789abc', region: 'us-east-1', zone: 'us-east-1a' },
    
    // Missing fields
    { region: 'fr-par' }
  ];

  testInputs.forEach((input, index) => {
    try {
      console.log(`\n🧪 Testing input ${index + 1}:`, input);
      
      const result = validateScalewayConfig(input, ErrorEnvironment.DEVELOPMENT);
      console.log('✅ Validation successful:', result);
      
    } catch (error: unknown) {
      if (error instanceof ValidationError) {
        console.log('❌ Structured validation error:');
        console.log('  Code:', error.code);
        console.log('  Message:', error.message);
        console.log('  Category:', error.category);
        console.log('  Severity:', error.severity);
        
        const details = error.getDetails(ErrorEnvironment.DEVELOPMENT);
        if (details.suggestions) {
          console.log('  Suggestions:', details.suggestions);
        }
        if (details.docsUrl) {
          console.log('  Documentation:', details.docsUrl);
        }
        
        console.log('  Context:', JSON.stringify(error.context, null, 2));
      } else {
        console.log('❌ Unhandled error:', error);
      }
    }
  });
}

/**
 * Production vs Development error handling example
 */
export function environmentExample(): void {
  const invalidInput = { projectId: 'bad-id', region: 'invalid-region' };
  
  console.log('\n🏭 Production Environment:');
  try {
    validateScalewayConfig(invalidInput, ErrorEnvironment.PRODUCTION);
  } catch (error: unknown) {
    if (error instanceof ValidationError) {
      console.log('Message:', error.message); // User-friendly
      console.log('Context:', JSON.stringify(error.getDetails(ErrorEnvironment.PRODUCTION).context)); // Empty
    }
  }
  
  console.log('\n🔧 Development Environment:');
  try {
    validateScalewayConfig(invalidInput, ErrorEnvironment.DEVELOPMENT);
  } catch (error: unknown) {
    if (error instanceof ValidationError) {
      console.log('Message:', error.message); // Technical details
      console.log('Context:', JSON.stringify(error.getDetails(ErrorEnvironment.DEVELOPMENT).context, null, 2)); // Full details
    }
  }
}

// Run examples if this file is executed directly
if (require.main === module) {
  console.log('🚨 Error Taxonomy System - Usage Examples\n');
  exampleUsage();
  environmentExample();
}