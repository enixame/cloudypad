/**
 * Scaleway-only import example
 * Should include core + Scaleway, exclude other providers
 */

import { validateScalewayClientArgs } from '../../src/providers/scaleway/types/validation-elegant';

// Only use Scaleway functionality
const config = {
  projectId: '12345678-1234-1234-1234-123456789abc',
  region: 'fr-par',
  zone: 'fr-par-1'
};

try {
  const result = validateScalewayClientArgs(config);
  console.log('Scaleway validation result:', !!result);
} catch (error) {
  console.log('Validation failed:', error);
}

export { config };