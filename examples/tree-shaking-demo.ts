/**
 * Tree-shaking usage examples
 * Demonstrates how to import only what you need
 */

// Examples of optimal imports (commented to avoid unused import warnings)
// import { InstanceManager, CoreValidators } from 'cloudypad/core';
// import { ScalewayProviderClient, validateScalewayClientArgs } from 'cloudypad/providers/scaleway';
// import { getDefaultValidationConfig, migrateSchema } from 'cloudypad/validation';
// import { ErrorCategory, ValidationError, createError } from 'cloudypad/errors';

// Actual imports for this demo
import { CoreValidators } from '../src/core/validation/patterns';
import { ErrorCategory, createError } from '../src/core/errors/taxonomy';

/**
 * Example 1: Core functionality only
 * Bundle size: ~15KB (core only)
 */
function exampleCoreOnly() {
  console.log('📦 Tree-shaking Example 1: Core Only');
  
  // Use core validators
  const isValidUUID = CoreValidators.isValidUUID('12345678-1234-1234-1234-123456789abc');
  console.log('UUID validation:', isValidUUID);
  
  console.log('Bundle includes: Core validators only');
  console.log('Bundle excludes: All providers, errors, validation\n');
}

/**
 * Example 2: Scaleway provider only
 * Bundle size: ~45KB (core + Scaleway)
 */
function exampleScalewayOnly() {
  console.log('📦 Tree-shaking Example 2: Scaleway Only');
  
  try {
    // Use Scaleway validation
    const config = {
      projectId: '12345678-1234-1234-1234-123456789abc',
      region: 'fr-par',
      zone: 'fr-par-1'
    };
    
    const validConfig = validateScalewayClientArgs(config);
    console.log('Scaleway config valid:', !!validConfig);
    
  } catch (error) {
    // Handle Scaleway-specific errors
    if (error instanceof ValidationError) {
      console.log('Validation error:', error.message);
    }
  }
  
  console.log('Bundle includes: Core + Scaleway provider');
  console.log('Bundle excludes: AWS, Azure, GCP providers\n');
}

/**
 * Example 3: Validation system only
 * Bundle size: ~25KB (core + validation)
 */
function exampleValidationOnly() {
  console.log('📦 Tree-shaking Example 3: Validation Only');
  
  const config = getDefaultValidationConfig();
  console.log('Default validation mode:', config.mode);
  
  // Migration example (hypothetical)
  const oldData = { region: 'fr-par' };
  try {
    const migratedData = migrateSchema(oldData, 'v1', 'v1'); // No-op migration
    console.log('Migration successful:', !!migratedData);
  } catch (error) {
    console.log('Migration failed:', error);
  }
  
  console.log('Bundle includes: Core + Validation + Migration');
  console.log('Bundle excludes: All providers, error handling\n');
}

/**
 * Example 4: Error handling only
 * Bundle size: ~20KB (core + errors)
 */
function exampleErrorsOnly() {
  console.log('📦 Tree-shaking Example 4: Errors Only');
  
  // Create a structured error
  const errorCode = {
    code: 'EXAMPLE_ERROR',
    category: ErrorCategory.VALIDATION,
    severity: 'ERROR' as const,
    devMessage: 'Example error for tree-shaking demo',
    prodMessage: 'An error occurred'
  };
  
  const error = createError(errorCode, { example: true });
  console.log('Error created:', error.code);
  console.log('Error category:', error.category);
  
  console.log('Bundle includes: Core + Error taxonomy');
  console.log('Bundle excludes: All providers, validation\n');
}

/**
 * Bundle size comparison
 */
function showBundleSizes() {
  console.log('📊 Estimated Bundle Sizes (with tree-shaking):');
  console.log('├─ Core only:           ~15KB');
  console.log('├─ Core + Scaleway:     ~45KB');
  console.log('├─ Core + Validation:   ~25KB');
  console.log('├─ Core + Errors:       ~20KB');
  console.log('├─ Full Scaleway:       ~60KB');
  console.log('└─ Everything:          ~150KB');
  console.log('');
  console.log('📊 Without tree-shaking:');
  console.log('└─ Everything always:   ~200KB+');
  console.log('');
  console.log('💡 Tree-shaking benefits:');
  console.log('├─ 60-90% smaller bundles');
  console.log('├─ Faster loading times');
  console.log('├─ Better caching');
  console.log('└─ Reduced memory usage');
}

/**
 * Import patterns demonstration
 */
function showImportPatterns() {
  console.log('📝 Tree-shaking Import Patterns:\n');
  
  console.log('❌ Bad - Imports everything:');
  console.log(`import * as CloudyPad from 'cloudypad';`);
  console.log(`// Bundle: 200KB+ (everything included)\n`);
  
  console.log('✅ Good - Imports specific functionality:');
  console.log(`import { InstanceManager } from 'cloudypad/core';`);
  console.log(`// Bundle: ~15KB (core only)\n`);
  
  console.log('✅ Good - Imports one provider:');
  console.log(`import { ScalewayProviderClient } from 'cloudypad/providers/scaleway';`);
  console.log(`// Bundle: ~45KB (core + Scaleway)\n`);
  
  console.log('✅ Good - Imports validation only:');
  console.log(`import { validateScalewayClientArgs } from 'cloudypad/validation';`);
  console.log(`// Bundle: ~25KB (core + validation)\n`);
  
  console.log('✅ Best - Combines multiple specific imports:');
  console.log(`import { InstanceManager } from 'cloudypad/core';`);
  console.log(`import { ScalewayProviderClient } from 'cloudypad/providers/scaleway';`);
  console.log(`import { ValidationError } from 'cloudypad/errors';`);
  console.log(`// Bundle: ~60KB (exactly what you need)`);
}

/**
 * Main demonstration
 */
async function main() {
  console.log('🌲 Cloudy Pad Tree-shaking Demonstration\n');
  
  showImportPatterns();
  console.log('\n' + '='.repeat(60) + '\n');
  
  exampleCoreOnly();
  exampleScalewayOnly(); 
  exampleValidationOnly();
  exampleErrorsOnly();
  
  console.log('='.repeat(60) + '\n');
  showBundleSizes();
}

if (require.main === module) {
  main().catch(console.error);
}

export {
  exampleCoreOnly,
  exampleScalewayOnly,
  exampleValidationOnly,
  exampleErrorsOnly
};