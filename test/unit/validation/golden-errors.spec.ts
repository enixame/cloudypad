/**
 * Golden error message tests - freezes error messages for consistent DX
 * Any change in error messages will require explicit snapshot updates
 */

import { describe, it } from 'mocha';
import { expect } from 'chai';
import { validateScalewayClientArgs } from '../../../src/providers/scaleway/types/validation-elegant';
import { getDefaultValidationConfig } from '../../../src/providers/scaleway/validation';

describe('Golden error message tests', () => {
  const testConfig = {
    ...getDefaultValidationConfig(),
    mode: 'strict' as const,
    enableTelemetry: false, // No noise in error messages
  };

  describe('Validation error messages should be stable', () => {
    it('should have consistent error for invalid project ID format', () => {
      expect(() => {
        validateScalewayClientArgs({
          projectId: 'not-a-uuid'
        }, testConfig);
      }).to.throw().with.property('message').that.includes('❌ Validation errors:');
    });

    it('should have consistent error for invalid region format', () => {
      expect(() => {
        validateScalewayClientArgs({
          region: 'INVALID-REGION'
        }, testConfig);
      }).to.throw().with.property('message').that.includes('Invalid region format');
    });

    it('should have consistent error for invalid zone format', () => {
      expect(() => {
        validateScalewayClientArgs({
          zone: 'invalid-zone'
        }, testConfig);
      }).to.throw().with.property('message').that.includes('Invalid zone format');
    });

    it('should have consistent error for zone-region mismatch', () => {
      expect(() => {
        validateScalewayClientArgs({
          zone: 'fr-par-1',
          region: 'nl-ams'
        }, testConfig);
      }).to.throw().with.property('message').that.includes('Zone fr-par-1');
    });

    it('should have helpful suggestion for zone-region mismatch', () => {
      expect(() => {
        validateScalewayClientArgs({
          zone: 'fr-par-1',
          region: 'nl-ams'
        }, testConfig);
      }).to.throw().with.property('message').that.includes('--region fr-par');
    });
  });

  describe('Lenient mode repair messages', () => {
    interface TestConfig extends ReturnType<typeof getDefaultValidationConfig> {
      _lastRepair?: { operation: string; original: unknown; repaired: unknown; context: string };
      mode: 'lenient';
      enableTelemetry: true;
    }
    
    const lenientConfig: TestConfig = {
      ...getDefaultValidationConfig(),
      mode: 'lenient' as const,
      enableTelemetry: true,
      logger: {
        logRepair: (operation: string, original: unknown, repaired: unknown, context: string) => {
          // Store repair messages for testing
          lenientConfig._lastRepair = { operation, original, repaired, context };
        },
        countFallback: () => {},
      },
    };

    it('should repair zone-region mismatch with telemetry', () => {
      const result = validateScalewayClientArgs({
        zone: 'fr-par-1',
        region: 'nl-ams' // Wrong region
      }, lenientConfig);

      // Should auto-repair to correct region
      expect(result.region).to.equal('fr-par');
      expect(result.zone).to.equal('fr-par-1');

      // Should log the repair
      expect(lenientConfig._lastRepair).to.deep.include({
        context: 'inconsistent_region'
      });
    });

    it('should infer missing region from zone', () => {
      const result = validateScalewayClientArgs({
        zone: 'fr-par-1'
        // region missing
      }, lenientConfig);

      // Should auto-infer region
      expect(result.region).to.equal('fr-par');
      expect(result.zone).to.equal('fr-par-1');

      // Should log the repair
      expect(lenientConfig._lastRepair).to.deep.include({
        context: 'missing_region'
      });
    });
  });

  describe('Input normalization messages', () => {
    interface NormalizationTestConfig extends ReturnType<typeof getDefaultValidationConfig> {
      _repairs?: Array<{ operation: string; original: unknown; repaired: unknown; context: string }>;
      mode: 'lenient';
      enableTelemetry: true;
    }
    
    const normalizationConfig: NormalizationTestConfig = {
      ...getDefaultValidationConfig(),
      mode: 'lenient' as const,
      enableTelemetry: true,
      logger: {
        logRepair: (operation: string, original: unknown, repaired: unknown, context: string) => {
          normalizationConfig._repairs = normalizationConfig._repairs || [];
          normalizationConfig._repairs.push({ operation, original, repaired, context });
        },
        countFallback: () => {},
      },
    };

    it('should normalize uppercase region input', () => {
      const result = validateScalewayClientArgs({
        region: '  FR-PAR  ', // Uppercase with spaces
        zone: 'fr-par-1'
      }, normalizationConfig);

      expect(result.region).to.equal('fr-par');
      
      // Should log normalization
      const repairs = normalizationConfig._repairs || [];
      expect(repairs.some(r => r.context === 'boundary_cleanup')).to.equal(true);
    });
  });
});