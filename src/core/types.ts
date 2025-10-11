/**
 * Common utility types for the Cloudy Pad project
 */

/** 
 * A value that may be omitted (commonly used for optional params/props).
 * @example const dataDiskIops: Optional<number> = undefined; // not provided
 */
export type Optional<T> = T | undefined;

/** 
 * A value that may be explicitly null (intentional absence).
 * @example const middleName: Nullable<string> = null; // intentionally empty
 */
export type Nullable<T> = T | null;

/** 
 * A value that may be null or undefined (nullish).
 * @example const apiResponse: Maybe<string> = Math.random() > 0.5 ? 'ok' : undefined;
 */
export type Maybe<T> = T | null | undefined;

/** 
 * Helper predicate for nullish checks.
 * @example
 * ```typescript
 * if (!isNullish(apiResponse)) {
 *   // apiResponse: string
 * }
 * ```
 */
export const isNullish = (v: unknown): v is null | undefined => v == null;