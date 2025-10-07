#!/usr/bin/env ts-node
/**
 * Migration performance benchmark
 * Validates that schema migrations meet performance requirements
 */

import { performance } from 'perf_hooks';
import { 
  migrateSchema, 
  adapterRegistry,
  type SchemaAdapter,
  type MigrationContext 
} from '../src/providers/scaleway/validation/adapters';
import type { SchemaVersion } from '../src/providers/scaleway/validation/versioning';

// Mock v1→v2 adapter for benchmarking
const benchmarkAdapter: SchemaAdapter = {
  fromVersion: 'v1',
  toVersion: 'v2' as SchemaVersion,
  
  isApplicable(context: MigrationContext): boolean {
    return context.fromVersion === 'v1' && context.toVersion === 'v2';
  },
  
  migrate(input: unknown): unknown {
    const data = input as Record<string, unknown>;
    const migrated = { ...data };
    
    // Simulate real migration work
    if (typeof data.region === 'string') {
      const regionMappings: Record<string, string> = {
        'fr-par': 'europe-france-paris',
        'nl-ams': 'europe-netherlands-amsterdam',
        'pl-waw': 'europe-poland-warsaw'
      };
      migrated.region = regionMappings[data.region] || data.region;
    }
    
    migrated.__migrated = true;
    migrated.__timestamp = Date.now();
    
    return migrated;
  }
};

// Register benchmark adapter
adapterRegistry.register(benchmarkAdapter);

interface BenchmarkResult {
  operation: string;
  totalTime: number;
  operationsPerSecond: number;
  averageTimePerOp: number;
  samples: number;
}

function runBenchmark(
  name: string,
  operation: () => void,
  iterations: number = 10000
): BenchmarkResult {
  console.log(`🔧 Running ${name} benchmark (${iterations} iterations)...`);
  
  // Warmup
  for (let i = 0; i < 100; i++) {
    operation();
  }
  
  // Actual benchmark
  const startTime = performance.now();
  
  for (let i = 0; i < iterations; i++) {
    operation();
  }
  
  const endTime = performance.now();
  const totalTime = endTime - startTime;
  const averageTimePerOp = totalTime / iterations;
  const operationsPerSecond = 1000 / averageTimePerOp;
  
  return {
    operation: name,
    totalTime,
    operationsPerSecond,
    averageTimePerOp,
    samples: iterations
  };
}

function formatResults(result: BenchmarkResult): void {
  console.log(`
📊 ${result.operation} Results:
   Total time: ${result.totalTime.toFixed(2)}ms
   Operations/sec: ${result.operationsPerSecond.toFixed(0)}
   Avg time/op: ${result.averageTimePerOp.toFixed(4)}ms
   Samples: ${result.samples}
`);
}

async function main(): Promise<void> {
  console.log('🚀 Schema Migration Performance Benchmark\n');
  
  // Test data sets
  const simpleInput = {
    projectId: '12345678-1234-1234-1234-123456789abc',
    region: 'fr-par',
    zone: 'fr-par-1'
  };
  
  const complexInput = {
    ...simpleInput,
    organizationId: '87654321-4321-4321-4321-210987654321',
    accessKey: 'SCWXXXXXXXXXXXXXXXXX',
    secretKey: 'xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx',
    metadata: {
      created: '2025-01-01T00:00:00Z',
      tags: ['gaming', 'performance', 'test'],
      config: {
        autoStop: true,
        backupEnabled: false
      }
    }
  };
  
  // Benchmark 1: Simple migration
  const simpleResult = runBenchmark(
    'Simple v1→v2 Migration',
    () => migrateSchema(simpleInput, 'v1', 'v2' as SchemaVersion),
    10000
  );
  formatResults(simpleResult);
  
  // Benchmark 2: Complex migration
  const complexResult = runBenchmark(
    'Complex v1→v2 Migration',
    () => migrateSchema(complexInput, 'v1', 'v2' as SchemaVersion),
    5000
  );
  formatResults(complexResult);
  
  // Benchmark 3: No-op migration (same version)
  const noopResult = runBenchmark(
    'No-op Migration (v1→v1)',
    () => migrateSchema(simpleInput, 'v1', 'v1'),
    20000
  );
  formatResults(noopResult);
  
  // Benchmark 4: Large object migration
  const largeInput: Record<string, unknown> = { ...simpleInput };
  for (let i = 0; i < 1000; i++) {
    largeInput[`prop${i}`] = `value${i}`;
  }
  
  const largeResult = runBenchmark(
    'Large Object Migration (1000+ props)',
    () => migrateSchema(largeInput, 'v1', 'v2' as SchemaVersion),
    1000
  );
  formatResults(largeResult);
  
  // Performance assertions
  console.log('✅ Performance Validation:');
  
  const assertions = [
    {
      name: 'Simple migration should exceed 50K ops/sec',
      condition: simpleResult.operationsPerSecond > 50000,
      actual: simpleResult.operationsPerSecond
    },
    {
      name: 'Complex migration should exceed 20K ops/sec',
      condition: complexResult.operationsPerSecond > 20000,
      actual: complexResult.operationsPerSecond
    },
    {
      name: 'No-op migration should exceed 100K ops/sec',
      condition: noopResult.operationsPerSecond > 100000,
      actual: noopResult.operationsPerSecond
    },
    {
      name: 'Large object migration should exceed 1K ops/sec',
      condition: largeResult.operationsPerSecond > 1000,
      actual: largeResult.operationsPerSecond
    }
  ];
  
  let allPassed = true;
  for (const assertion of assertions) {
    const status = assertion.condition ? '✅' : '❌';
    console.log(`   ${status} ${assertion.name} (${Math.round(assertion.actual)} ops/sec)`);
    if (!assertion.condition) {
      allPassed = false;
    }
  }
  
  if (allPassed) {
    console.log('\n🎉 All performance benchmarks passed!');
  } else {
    console.log('\n⚠️  Some performance benchmarks failed. Consider optimization.');
    process.exit(1);
  }
}

if (require.main === module) {
  main().catch(console.error);
}

export { runBenchmark, formatResults };