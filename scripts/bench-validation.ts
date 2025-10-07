/**
 * Performance benchmarks for validation system
 * Monitors parse/s performance and alerts on regressions
 */

import { performance } from 'perf_hooks';
import { validateScalewayClientArgs } from '../../../src/providers/scaleway/types/validation-elegant';
import { getDefaultValidationConfig } from '../../../src/providers/scaleway/validation';

// Performance baselines (to be adjusted based on target hardware)
const PERFORMANCE_BASELINES = {
  PARSE_PER_SECOND_MIN: 50_000,      // Minimum acceptable parse/s
  SINGLE_PARSE_MAX_MS: 0.1,          // Maximum time for single parse
  BATCH_PARSE_MAX_MS: 10,            // Maximum time for 1000 parses
} as const;

/**
 * Benchmark validation performance
 */
export function benchmarkValidation(): BenchmarkResults {
  const validInput = {
    projectId: '550e8400-e29b-41d4-a716-446655440000',
    zone: 'fr-par-1',
    region: 'fr-par'
  };

  const config = {
    ...getDefaultValidationConfig(),
    mode: 'strict' as const,
    enableTelemetry: false, // No logging overhead
  };

  // Warm up
  for (let i = 0; i < 1000; i++) {
    validateScalewayClientArgs(validInput, config);
  }

  // Single parse benchmark
  const singleStart = performance.now();
  validateScalewayClientArgs(validInput, config);
  const singleTime = performance.now() - singleStart;

  // Batch parse benchmark
  const batchSize = 10_000;
  const batchStart = performance.now();
  
  for (let i = 0; i < batchSize; i++) {
    validateScalewayClientArgs(validInput, config);
  }
  
  const batchTime = performance.now() - batchStart;
  const parsesPerSecond = (batchSize / batchTime) * 1000;

  return {
    singleParseMs: singleTime,
    batchParseMs: batchTime,
    parsesPerSecond,
    batchSize,
    passesBaseline: {
      singleParse: singleTime <= PERFORMANCE_BASELINES.SINGLE_PARSE_MAX_MS,
      batchParse: batchTime <= PERFORMANCE_BASELINES.BATCH_PARSE_MAX_MS,
      throughput: parsesPerSecond >= PERFORMANCE_BASELINES.PARSE_PER_SECOND_MIN,
    }
  };
}

export interface BenchmarkResults {
  singleParseMs: number;
  batchParseMs: number;
  parsesPerSecond: number;
  batchSize: number;
  passesBaseline: {
    singleParse: boolean;
    batchParse: boolean;
    throughput: boolean;
  };
}

/**
 * Generate performance report
 */
export function generatePerformanceReport(results: BenchmarkResults): string {
  const { singleParseMs, batchParseMs, parsesPerSecond, batchSize, passesBaseline } = results;

  const status = Object.values(passesBaseline).every(Boolean) ? '✅ PASS' : '❌ FAIL';
  
  return `
📊 Validation Performance Report ${status}

Single Parse: ${singleParseMs.toFixed(4)}ms ${passesBaseline.singleParse ? '✅' : '❌'} (baseline: ≤${PERFORMANCE_BASELINES.SINGLE_PARSE_MAX_MS}ms)
Batch Parse:  ${batchParseMs.toFixed(2)}ms for ${batchSize.toLocaleString()} ops ${passesBaseline.batchParse ? '✅' : '❌'} (baseline: ≤${PERFORMANCE_BASELINES.BATCH_PARSE_MAX_MS}ms)
Throughput:   ${Math.round(parsesPerSecond).toLocaleString()} parse/s ${passesBaseline.throughput ? '✅' : '❌'} (baseline: ≥${PERFORMANCE_BASELINES.PARSE_PER_SECOND_MIN.toLocaleString()} parse/s)

${!Object.values(passesBaseline).every(Boolean) ? 
  '⚠️  Performance regression detected! Consider optimizations or review recent changes.' : 
  '🎯 All performance benchmarks passed!'
}
`.trim();
}

/**
 * Compare validation engines (future: Zod vs Valibot)
 */
export function compareValidationEngines(): EngineComparison {
  const results = benchmarkValidation();
  
  // Placeholder for future Valibot comparison
  return {
    zod: results,
    // valibot: benchmarkValibot(), // Future implementation
    recommendation: results.parsesPerSecond >= 1_000_000 ? 
      'Current Zod performance is excellent' :
      'Consider Valibot for >1M parse/s requirements'
  };
}

export interface EngineComparison {
  zod: BenchmarkResults;
  // valibot?: BenchmarkResults;
  recommendation: string;
}

// CLI runner for standalone benchmarking
if (require.main === module) {
  console.log('🚀 Running Scaleway validation benchmarks...\n');
  
  const results = benchmarkValidation();
  const report = generatePerformanceReport(results);
  
  console.log(report);
  
  // Exit with error code if performance regression
  const allPassed = Object.values(results.passesBaseline).every(Boolean);
  process.exit(allPassed ? 0 : 1);
}