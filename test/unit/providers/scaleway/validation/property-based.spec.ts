/**
 * Property-based tests for Scaleway validation invariants
 * Tests that properties hold for all possible inputs
 */

import fc from 'fast-check';
import { describe, it } from 'mocha';
import { expect } from 'chai';
import { zoneToRegion, validateZoneRegionConsistency } from '../../../../../src/providers/scaleway/validation/region-mapping';
import { validateUUID, validateRegion, validateZone } from '../../../../../src/providers/scaleway/validation/regex-defense';

describe('Property-based validation tests', () => {
  describe('Zone-Region consistency invariants', () => {
    it('should always derive consistent region from valid zone', () => {
      // Generate valid zone patterns: fr-par-1, nl-ams-2, etc.
      const validZoneArb = fc.tuple(
        fc.constantFrom('fr', 'nl', 'pl'),
        fc.constantFrom('par', 'ams', 'waw'),
        fc.integer({ min: 1, max: 9 })
      ).map(([country, city, num]) => `${country}-${city}-${num}`);

      fc.assert(fc.property(validZoneArb, (zone) => {
        const derivedRegion = zoneToRegion(zone);
        // Invariant: derived region should be consistent with original zone
        expect(validateZoneRegionConsistency(zone, derivedRegion)).to.equal(true);
        // Invariant: region should follow pattern: cc-ccc
        expect(derivedRegion).to.match(/^[a-z]{2}-[a-z]{3}$/);
      }));
    });

    it('should validate zone-region pairs consistently', () => {
      const validPairArb = fc.tuple(
        fc.constantFrom('fr-par', 'nl-ams', 'pl-waw'),
        fc.integer({ min: 1, max: 9 })
      ).map(([baseRegion, num]) => ({
        zone: `${baseRegion}-${num}`,
        region: baseRegion
      }));

      fc.assert(fc.property(validPairArb, ({ zone, region }) => {
        // Invariant: matching zone-region pairs should always validate
        expect(validateZoneRegionConsistency(zone, region)).to.equal(true);
      }));
    });
  });

  describe('Input validation invariants', () => {
    it('should handle all valid UUID formats', () => {
      // Generate valid UUIDs using a simple approach
      const validUuidArb = fc.constantFrom(
        '550e8400-e29b-41d4-a716-446655440000',
        '6ba7b810-9dad-11d1-80b4-00c04fd430c8',
        '6ba7b811-9dad-11d1-80b4-00c04fd430c8',
        '12345678-1234-1234-1234-123456789abc'
      );

      fc.assert(fc.property(validUuidArb, (uuid) => {
        // Invariant: all valid UUIDs should pass validation
        expect(validateUUID(uuid)).to.equal(true);
      }));
    });

    it('should reject malformed regions consistently', () => {
      // Generate invalid region patterns using explicit construction
      const invalidRegionArb = fc.oneof(
        // Wrong format patterns (under size limit to avoid exceptions)
        fc.oneof(
          // Missing dash
          fc.tuple(fc.string({ minLength: 2, maxLength: 5 }), fc.string({ minLength: 2, maxLength: 5 }))
            .map(([a, b]) => a + b),
          // Wrong separator
          fc.tuple(fc.string({ minLength: 2, maxLength: 3 }), fc.string({ minLength: 2, maxLength: 3 }))
            .map(([a, b]) => `${a}_${b}`),
          // Too many parts
          fc.array(fc.string({ minLength: 1, maxLength: 3 }), { minLength: 3, maxLength: 5 })
            .map(parts => parts.join('-'))
        ),
        // Wrong case/numbers
        fc.constantFrom('FR-PAR', 'nl-AMS', '12-345', 'FR-par', 'fr-PAR', 'fr-p4r', 'empty', ' ')
      );

      fc.assert(fc.property(invalidRegionArb, (invalidRegion) => {
        // Invariant: invalid regions should either return false or throw for size limit
        try {
          const result = validateRegion(invalidRegion);
          expect(result).to.equal(false);
        } catch (error) {
          // Size limit errors are acceptable for this test
          expect((error as Error).message).to.include('Input too large');
        }
      }));
    });

    it('should handle edge cases in zone validation', () => {
      // Generate edge case zones using explicit construction (under size limit)
      const edgeCaseArb = fc.oneof(
        fc.constant(''),                                      // Empty
        fc.constantFrom('fr-par', 'fr-par-', 'fr-par-abc'), // Incomplete/invalid
        fc.constantFrom('FR-PAR-1', 'fr-PAR-1'),            // Wrong case
        // Additional explicit invalid patterns
        fc.constantFrom('fr-par-x', 'fr_par_1', 'fr.par.1', 'short', 'fr-par-', 'fr-par-abc')
      );

      fc.assert(fc.property(edgeCaseArb, (edgeCase) => {
        // Invariant: edge cases should either return false or be handled gracefully
        try {
          const result = validateZone(edgeCase);
          expect(result).to.equal(false);
        } catch (error) {
          // Size limit errors are acceptable behavior
          expect((error as Error).message).to.include('Input too large');
        }
      }));
    });
  });

  describe('Performance invariants', () => {
    it('should validate inputs within reasonable time bounds', () => {
      const validInputArb = fc.constantFrom(
        'fr-par',                                 // Valid region
        'fr-par-1'                               // Valid zone
      );
      
      const validUuidArb = fc.constantFrom(
        '550e8400-e29b-41d4-a716-446655440000', // Valid UUID (36 chars, under limit)
        '12345678-1234-1234-1234-123456789abc'  // Valid UUID (36 chars, under limit)
      );

      fc.assert(fc.property(validInputArb, (input) => {
        const start = performance.now();
        
        // Try region and zone validators (these inputs are safe)
        validateRegion(input);
        validateZone(input);
        
        const elapsed = performance.now() - start;
        
        // Invariant: validation should complete within 1ms
        expect(elapsed).to.be.lessThan(1.0);
      }));
      
      fc.assert(fc.property(validUuidArb, (uuid) => {
        const start = performance.now();
        
        // Test UUID validator separately
        validateUUID(uuid);
        
        const elapsed = performance.now() - start;
        
        // Invariant: UUID validation should complete within 1ms
        expect(elapsed).to.be.lessThan(1.0);
      }));
    });
  });
});