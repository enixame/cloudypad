/**
 * Core branded types for multi-provider type safety
 * These types can be used across all cloud providers
 */

/**
 * Brand utility type for creating type-safe branded types
 */
export type Brand<T, TBrand> = T & { readonly __brand: TBrand }

/**
 * Core branded types used across all providers
 */
export type UUID = Brand<string, 'UUID'>
export type IPv4Address = Brand<string, 'IPv4Address'>
export type InstanceName = Brand<string, 'InstanceName'>
export type DotNotationPath = Brand<string, 'DotNotationPath'>

/**
 * Core type creators for creating branded types safely
 * These functions both validate and brand values in one step
 */
export class CoreBrandedTypeCreators {
    /**
     * Creates a branded UUID from a string
     * @param value - String to validate and brand
     * @returns Branded UUID
     * @throws Error if validation fails
     */
    static createUUID(value: string): UUID {
        if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)) {
            throw new Error(`Invalid UUID format: ${value}`)
        }
        return value as UUID
    }

    /**
     * Creates a branded IPv4 address
     * @param value - String to validate and brand as IPv4
     * @returns Branded IPv4Address
     * @throws Error if validation fails
     */
    static createIPv4Address(value: string): IPv4Address {
        if (!/^((25[0-5]|(2[0-4]|1\d|[1-9]|)\d)\.?\b){4}$/.test(value)) {
            throw new Error(`Invalid IPv4 address format: ${value}`)
        }
        return value as IPv4Address
    }

    /**
     * Creates a branded instance name
     * @param value - String to validate and brand as instance name
     * @returns Branded InstanceName
     * @throws Error if validation fails
     */
    static createInstanceName(value: string): InstanceName {
        if (!value || value.length > 63 || !/^[a-zA-Z][a-zA-Z0-9-]*[a-zA-Z0-9]$/.test(value)) {
            throw new Error(`Invalid instance name format: ${value}`)
        }
        return value as InstanceName
    }

    /**
     * Creates a branded dot-notation path
     * @param value - String to validate and brand as path
     * @returns Branded DotNotationPath
     * @throws Error if validation fails
     */
    static createDotNotationPath(value: string): DotNotationPath {
        if (!/^[a-zA-Z][a-zA-Z0-9.]*[a-zA-Z0-9]$/.test(value)) {
            throw new Error(`Invalid dot-notation path format: ${value}`)
        }
        return value as DotNotationPath
    }
}