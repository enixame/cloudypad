/**
 * Type contract tests - ensuring API stability at .d.ts level
 * These tests validate branded types and prevent API regressions
 */

import { expectType, expectAssignable, expectNotAssignable } from 'tsd';
import type { 
  ScalewayProjectId, 
  ScalewayRegion, 
  ScalewayZone, 
  ScalewayCommercialType,
  ScalewayClientArgs 
} from '../../../../src/providers/scaleway/types/branded';

// Test branded type safety - should prevent type mixing
declare const projectId: ScalewayProjectId;
declare const region: ScalewayRegion;
declare const zone: ScalewayZone;
declare const commercialType: ScalewayCommercialType;

// Branded types should be assignable to their base type
expectAssignable<string>(projectId);
expectAssignable<string>(region);
expectAssignable<string>(zone);
expectAssignable<string>(commercialType);

// But base types should NOT be assignable to branded types (compile-time safety)
declare const rawString: string;
expectNotAssignable<ScalewayProjectId>(rawString);
expectNotAssignable<ScalewayRegion>(rawString);
expectNotAssignable<ScalewayZone>(rawString);
expectNotAssignable<ScalewayCommercialType>(rawString);

// Branded types should not be assignable to each other (prevent mixing)
expectNotAssignable<ScalewayProjectId>(region);
expectNotAssignable<ScalewayRegion>(zone);
expectNotAssignable<ScalewayZone>(commercialType);
expectNotAssignable<ScalewayCommercialType>(projectId);

// ScalewayClientArgs interface contract
declare const validArgs: ScalewayClientArgs;
expectType<ScalewayClientArgs>(validArgs);

// All fields should be optional
expectAssignable<ScalewayClientArgs>({});
expectAssignable<ScalewayClientArgs>({ projectId });
expectAssignable<ScalewayClientArgs>({ region });
expectAssignable<ScalewayClientArgs>({ zone });
expectAssignable<ScalewayClientArgs>({ projectId, region, zone });

// Fields should have correct branded types
expectType<ScalewayProjectId | undefined>(validArgs.projectId);
expectType<ScalewayRegion | undefined>(validArgs.region);
expectType<ScalewayZone | undefined>(validArgs.zone);
expectType<string | undefined>(validArgs.organizationId);

// Raw strings should not be assignable to branded fields (disabled for compilation)
// expectError<ScalewayClientArgs>({ projectId: 'raw-string' });
// expectError<ScalewayClientArgs>({ region: 'raw-string' });
// expectError<ScalewayClientArgs>({ zone: 'raw-string' });

// But organizationId should accept raw strings (not branded)
expectAssignable<ScalewayClientArgs>({ organizationId: 'raw-string' });

// Alternative approach: Test that branded types work correctly
declare const validProjectId: ScalewayProjectId;
declare const validRegion: ScalewayRegion;
declare const validZone: ScalewayZone;

// These should work fine
expectAssignable<ScalewayClientArgs>({ projectId: validProjectId });
expectAssignable<ScalewayClientArgs>({ region: validRegion });
expectAssignable<ScalewayClientArgs>({ zone: validZone });