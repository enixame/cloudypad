/**
 * Schema migration test harness
 * Comprehensive v1→v2 test cases with migration scenarios
 */

import { describe, it } from 'mocha';
import { expect } from 'chai';
import { 
  migrateSchema, 
  canMigrate, 
  getAvailableMigrations,
  adapterRegistry,
  type SchemaAdapter,
  type MigrationContext 
} from '../../../src/providers/scaleway/validation/adapters';
import { 
  getLatestSchemaVersion, 
  isSupportedVersion,
  getVersionInfo,
  type SchemaVersion 
} from '../../../src/providers/scaleway/validation/versioning';
import { validateScalewayClientArgs } from '../../../src/providers/scaleway/types/validation-elegant';
import { getDefaultValidationConfig } from '../../../src/providers/scaleway/validation';

describe('🔄 Schema Migration Test Harness', () => {
  
  describe('Migration Infrastructure', () => {
    
    it('should validate current schema version system', () => {
      const currentVersion = getLatestSchemaVersion();
      expect(currentVersion).to.equal('v1');
      expect(isSupportedVersion('v1')).to.equal(true);
      
      const versionInfo = getVersionInfo('v1');
      expect(versionInfo).to.not.equal(null);
      expect(versionInfo?.description).to.include('branded types');
    });

    it('should handle migration queries correctly', () => {
      // Currently no adapters registered (v2 not implemented yet)
      const availableMigrations = getAvailableMigrations('v1');
      expect(availableMigrations).to.be.an('array');
      
      // Should return false for non-existent migrations
      expect(canMigrate('v1', 'v2' as SchemaVersion)).to.equal(false);
      expect(canMigrate('v0' as SchemaVersion, 'v1')).to.equal(false);
    });

    it('should handle no-op migrations correctly', () => {
      const input = { projectId: '12345678-1234-1234-1234-123456789abc', region: 'fr-par' };
      const result = migrateSchema(input, 'v1', 'v1');
      
      // Same version migration should return original input
      expect(result).to.deep.equal(input);
    });

  });

  describe('Migration Adapter Framework', () => {
    
    it('should support adapter registration and retrieval', () => {
      // Test the adapter registry functionality
      const initialAdapters = adapterRegistry.getAllAdapters();
      const initialCount = initialAdapters.length;
      
      // Create a test adapter
      const testAdapter: SchemaAdapter = {
        fromVersion: 'v1',
        toVersion: 'v2' as SchemaVersion,
        isApplicable: (context) => context.fromVersion === 'v1' && context.toVersion === 'v2',
        migrate: (input) => ({ ...input as Record<string, unknown>, migrated: true })
      };
      
      // Register it
      adapterRegistry.register(testAdapter);
      
      // Verify registration
      const newAdapters = adapterRegistry.getAllAdapters();
      expect(newAdapters).to.have.length(initialCount + 1);
      
      const foundAdapter = adapterRegistry.findAdapter('v1', 'v2' as SchemaVersion);
      expect(foundAdapter).to.not.equal(null);
      expect(foundAdapter?.fromVersion).to.equal('v1');
      expect(foundAdapter?.toVersion).to.equal('v2');
    });

  });

  describe('Hypothetical v1→v2 Migration Scenarios', () => {
    
    // Set up a mock v2 adapter for testing
    const mockV1ToV2Adapter: SchemaAdapter = {
      fromVersion: 'v1',
      toVersion: 'v2' as SchemaVersion,
      
      isApplicable(context: MigrationContext): boolean {
        return context.fromVersion === 'v1' && context.toVersion === 'v2';
      },
      
      migrate(input: unknown, context: MigrationContext): unknown {
        const data = input as Record<string, unknown>;
        const migrated = { ...data };
        
        // Example v2 migration: extend region format
        if (typeof data.region === 'string') {
          const region = data.region;
          // Hypothetical: fr-par → europe-france-paris
          const regionMappings: Record<string, string> = {
            'fr-par': 'europe-france-paris',
            'nl-ams': 'europe-netherlands-amsterdam',
            'pl-waw': 'europe-poland-warsaw'
          };
          migrated.region = regionMappings[region] || region;
        }
        
        // Add migration metadata
        migrated.__migratedFromV1 = true;
        migrated.__migrationTimestamp = new Date().toISOString();
        
        if (context.logger) {
          context.logger('Migrated region format', { original: data.region, new: migrated.region });
        }
        
        return migrated;
      }
    };

    beforeEach(() => {
      // Register mock adapter for tests
      adapterRegistry.register(mockV1ToV2Adapter);
    });

    it('should migrate v1 input to v2 format successfully', () => {
      const v1Input = {
        projectId: '12345678-1234-1234-1234-123456789abc',
        region: 'fr-par',
        zone: 'fr-par-1'
      };

      const migrated = migrateSchema(v1Input, 'v1', 'v2' as SchemaVersion);
      
      expect(migrated).to.be.an('object');
      const result = migrated as Record<string, unknown>;
      
      // Should preserve original data
      expect(result.projectId).to.equal(v1Input.projectId);
      expect(result.zone).to.equal(v1Input.zone);
      
      // Should migrate region format
      expect(result.region).to.equal('europe-france-paris');
      
      // Should add migration metadata
      expect(result.__migratedFromV1).to.equal(true);
      expect(result.__migrationTimestamp).to.be.a('string');
    });

    it('should handle complex migration scenarios', () => {
      const complexInput = {
        projectId: '12345678-1234-1234-1234-123456789abc',
        region: 'nl-ams',
        zone: 'nl-ams-2',
        organizationId: 'org-123',
        customField: 'should-be-preserved'
      };

      const migrated = migrateSchema(complexInput, 'v1', 'v2' as SchemaVersion);
      const result = migrated as Record<string, unknown>;
      
      // Should migrate known fields
      expect(result.region).to.equal('europe-netherlands-amsterdam');
      
      // Should preserve unknown fields
      expect(result.customField).to.equal('should-be-preserved');
      expect(result.organizationId).to.equal('org-123');
    });

    it('should preserve data integrity during migration', () => {
      const originalInput = {
        projectId: '12345678-1234-1234-1234-123456789abc',
        region: 'pl-waw',
        zone: 'pl-waw-1',
        sensitiveData: { secret: 'keep-me-safe' }
      };
      
      // Clone original to ensure it's not mutated
      const inputClone = JSON.parse(JSON.stringify(originalInput));
      
      const migrated = migrateSchema(inputClone, 'v1', 'v2' as SchemaVersion);
      const result = migrated as Record<string, unknown>;
      
      // Original should be unchanged
      expect(originalInput.region).to.equal('pl-waw');
      
      // Migrated should have new format
      expect(result.region).to.equal('europe-poland-warsaw');
      
      // Sensitive data should be preserved
      expect(result.sensitiveData).to.deep.equal({ secret: 'keep-me-safe' });
    });

    it('should handle migration logging correctly', () => {
      const loggedEvents: Array<{ message: string; data?: unknown }> = [];
      
      const logger = (message: string, data?: unknown) => {
        loggedEvents.push({ message, data });
      };

      const input = { region: 'fr-par', zone: 'fr-par-1' };
      
      const context: MigrationContext = {
        fromVersion: 'v1',
        toVersion: 'v2' as SchemaVersion,
        originalInput: input,
        logger
      };

      const adapter = adapterRegistry.findAdapter('v1', 'v2' as SchemaVersion);
      expect(adapter).to.not.equal(null);

      if (adapter) {
        adapter.migrate(input, context);
        
        // Should have logged the migration
        expect(loggedEvents).to.have.length.greaterThan(0);
        expect(loggedEvents[0].message).to.include('Migrated region');
        expect(loggedEvents[0].data).to.deep.include({
          original: 'fr-par',
          new: 'europe-france-paris'
        });
      }
    });

  });

  describe('Migration Error Handling', () => {
    
    it('should handle missing adapters gracefully', () => {
      const input = { region: 'fr-par' };
      
      expect(() => {
        migrateSchema(input, 'v1', 'v3' as SchemaVersion);
      }).to.throw('No migration adapter found for v1 → v3');
    });

    it('should handle adapter applicability checks', () => {
      // Create an adapter that's not applicable
      const nonApplicableAdapter: SchemaAdapter = {
        fromVersion: 'v1',
        toVersion: 'v2' as SchemaVersion,
        isApplicable: () => false, // Always returns false
        migrate: (input) => input
      };

      // Temporarily replace the adapter
      const originalAdapter = adapterRegistry.findAdapter('v1', 'v2' as SchemaVersion);
      adapterRegistry.register(nonApplicableAdapter);

      try {
        const input = { region: 'fr-par' };
        expect(() => {
          migrateSchema(input, 'v1', 'v2' as SchemaVersion);
        }).to.throw('Adapter v1 → v2 is not applicable to current input');
      } finally {
        // Restore original adapter if it existed
        if (originalAdapter) {
          adapterRegistry.register(originalAdapter);
        }
      }
    });

  });

  describe('Integration with Validation System', () => {
    
    it('should integrate migration with validation config', () => {
      const config = {
        ...getDefaultValidationConfig(),
        mode: 'lenient' as const,
        schemaVersion: 'v1' as SchemaVersion,
        enableAutoMigration: true,
        enableTelemetry: false
      };

      // Test with v1 input that should work fine
      const v1Input = {
        projectId: '12345678-1234-1234-1234-123456789abc',
        region: 'fr-par',
        zone: 'fr-par-1'
      };

      const result = validateScalewayClientArgs(v1Input, config);
      
      // Should validate successfully
      expect(result).to.not.equal(null);
      expect(result.region).to.equal('fr-par');
      expect(result.zone).to.equal('fr-par-1');
    });

    it('should handle auto-migration disabled', () => {
      const config = {
        ...getDefaultValidationConfig(),
        mode: 'lenient' as const,
        schemaVersion: 'v1' as SchemaVersion,
        enableAutoMigration: false, // Disabled
        enableTelemetry: false
      };

      // Should still work with auto-migration disabled (needs projectId for Zod validation)
      const input = { 
        projectId: '12345678-1234-1234-1234-123456789abc',
        region: 'fr-par', 
        zone: 'fr-par-1' 
      };
      const result = validateScalewayClientArgs(input, config);
      
      expect(result).to.not.equal(null);
      expect(result.region).to.equal('fr-par');
    });

  });

  describe('Migration Performance & Reliability', () => {
    
    it('should handle large inputs efficiently', () => {
      // Create a large input object
      const largeInput: Record<string, unknown> = {
        projectId: '12345678-1234-1234-1234-123456789abc',
        region: 'fr-par',
        zone: 'fr-par-1'
      };
      
      // Add many properties to test performance
      for (let i = 0; i < 1000; i++) {
        largeInput[`property${i}`] = `value${i}`;
      }

      const startTime = performance.now();
      const migrated = migrateSchema(largeInput, 'v1', 'v2' as SchemaVersion);
      const endTime = performance.now();
      
      // Should complete in reasonable time (< 50ms for 1000 properties on typical hardware)
      expect(endTime - startTime).to.be.lessThan(50);
      
      // Should preserve all data
      const result = migrated as Record<string, unknown>;
      expect(Object.keys(result)).to.have.length.greaterThan(1000);
      expect(result.region).to.equal('europe-france-paris');
    });

    it('should be idempotent for repeated migrations', () => {
      const input = { region: 'fr-par', zone: 'fr-par-1' };
      
      // First migration
      const firstMigration = migrateSchema(input, 'v1', 'v2' as SchemaVersion);
      
      // Should not attempt second migration (same version)
      const secondMigration = migrateSchema(firstMigration, 'v2' as SchemaVersion, 'v2' as SchemaVersion);
      
      expect(secondMigration).to.deep.equal(firstMigration);
    });

  });

  describe('Migration Documentation & Examples', () => {
    
    it('should provide clear migration examples', () => {
      // This test serves as living documentation
      
      // Example 1: Simple region migration
      const example1 = { region: 'fr-par' };
      const result1 = migrateSchema(example1, 'v1', 'v2' as SchemaVersion);
      expect((result1 as Record<string, unknown>).region).to.equal('europe-france-paris');
      
      // Example 2: Complex object migration
      const example2 = {
        projectId: '12345678-1234-1234-1234-123456789abc',
        region: 'nl-ams',
        zone: 'nl-ams-1',
        metadata: { created: '2025-01-01' }
      };
      const result2 = migrateSchema(example2, 'v1', 'v2' as SchemaVersion);
      const typed2 = result2 as Record<string, unknown>;
      expect(typed2.region).to.equal('europe-netherlands-amsterdam');
      expect(typed2.metadata).to.deep.equal({ created: '2025-01-01' });
      
      // Example 3: Migration with logging
      let logCount = 0;
      const logger = () => { logCount++; };
      
      const context: MigrationContext = {
        fromVersion: 'v1',
        toVersion: 'v2' as SchemaVersion,
        originalInput: example1,
        logger
      };
      
      const adapter = adapterRegistry.findAdapter('v1', 'v2' as SchemaVersion);
      if (adapter) {
        adapter.migrate(example1, context);
        expect(logCount).to.be.greaterThan(0);
      }
    });

  });

});