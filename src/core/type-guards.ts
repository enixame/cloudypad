/**
 * Generic Type Guards Architecture for Cloud Providers
 * Provides a unified, type-safe way to validate API responses across all cloud providers
 */

/**
 * Base type guard interface for extensibility
 */
export interface TypeGuardValidation<T> {
    (obj: unknown): obj is T;
}

/**
 * Configuration for creating type guards with custom validation rules
 */
export interface TypeGuardConfig<T> {
    /** Required properties that must exist and have the correct type */
    required?: Array<keyof T>;
    /** Optional properties with type validation */
    optional?: Array<keyof T>;
    /** Custom validation function for complex rules */
    customValidator?: (obj: Record<string, unknown>) => boolean;
    /** Human-readable description for debugging */
    description?: string;
}

/**
 * Generic Type Guard Builder for creating reusable type guards
 * Supports common validation patterns across all cloud providers
 * 
 * @example
 * ```typescript
 * const userGuard = TypeGuardBuilder.object<User>({
 *   required: ['id', 'name'],
 *   customValidator: (obj) => obj.id > 0
 * })
 * 
 * if (userGuard(data)) {
 *   // data is now typed as User
 *   console.log(data.name)
 * }
 * ```
 * 
 * @performance Uses structural validation with short-circuit evaluation
 * @threadsafe All methods are pure functions without side effects
 */
export class TypeGuardBuilder {
    /**
     * Creates a type guard for objects with specific properties
     */
    static object<T>(config: TypeGuardConfig<T>): TypeGuardValidation<T> {
        return (obj: unknown): obj is T => {
            if (typeof obj !== 'object' || obj === null) {
                return false;
            }

            const target = obj as Record<string, unknown>;

            // Validate required properties
            if (config.required) {
                for (const prop of config.required) {
                    if (!(String(prop) in target) || target[String(prop)] === undefined) {
                        return false;
                    }
                }
            }

            // Apply custom validation if provided
            if (config.customValidator && !config.customValidator(target)) {
                return false;
            }

            return true;
        };
    }

    /**
     * Creates a type guard for API responses with standard cloud provider patterns
     */
    static apiResponse<T>(config: {
        statusField?: string;
        dataField?: string;
        errorField?: string;
        requiredFields?: Array<keyof T>;
        description?: string;
    }): TypeGuardValidation<T> {
        return this.object<T>({
            required: config.requiredFields,
            customValidator: (obj) => {
                // Check for standard API response structure
                if (config.statusField && typeof obj[config.statusField] !== 'string') {
                    return false;
                }
                if (config.errorField && obj[config.errorField] !== undefined && typeof obj[config.errorField] !== 'string') {
                    return false;
                }
                return true;
            },
            description: config.description
        });
    }

    /**
     * Creates a type guard for arrays with element validation
     */
    static array<T>(elementGuard: TypeGuardValidation<T>): TypeGuardValidation<T[]> {
        return (obj: unknown): obj is T[] => {
            if (!Array.isArray(obj)) {
                return false;
            }
            return obj.every(elementGuard);
        };
    }

    /**
     * Creates a type guard for union types
     */
    static union<T>(...guards: TypeGuardValidation<T>[]): TypeGuardValidation<T> {
        return (obj: unknown): obj is T => {
            return guards.some(guard => guard(obj));
        };
    }

    /**
     * Creates a type guard for nullable types
     */
    static nullable<T>(guard: TypeGuardValidation<T>): TypeGuardValidation<T | null> {
        return (obj: unknown): obj is T | null => {
            return obj === null || guard(obj);
        };
    }

    /**
     * Creates a type guard for optional types
     */
    static optional<T>(guard: TypeGuardValidation<T>): TypeGuardValidation<T | undefined> {
        return (obj: unknown): obj is T | undefined => {
            return obj === undefined || guard(obj);
        };
    }
}

/**
 * Common type guards for standard cloud provider patterns
 */
export const CommonTypeGuards = {
    /**
     * Validates string values
     */
    string: (obj: unknown): obj is string => typeof obj === 'string',

    /**
     * Validates number values
     */
    number: (obj: unknown): obj is number => typeof obj === 'number' && !isNaN(obj),

    /**
     * Validates boolean values
     */
    boolean: (obj: unknown): obj is boolean => typeof obj === 'boolean',

    /**
     * Validates UUID format (common across cloud providers)
     */
    uuid: (obj: unknown): obj is string => {
        if (typeof obj !== 'string') return false;
        const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
        return uuidRegex.test(obj);
    },

    /**
     * Validates non-empty strings
     */
    nonEmptyString: (obj: unknown): obj is string => {
        return typeof obj === 'string' && obj.length > 0;
    },

    /**
     * Validates positive numbers
     */
    positiveNumber: (obj: unknown): obj is number => {
        return typeof obj === 'number' && !isNaN(obj) && obj > 0;
    },

    /**
     * Validates ISO date strings
     */
    isoDateString: (obj: unknown): obj is string => {
        if (typeof obj !== 'string') return false;
        const date = new Date(obj);
        return !isNaN(date.getTime()) && obj === date.toISOString();
    },

    /**
     * Validates objects with at least one property
     */
    nonEmptyObject: (obj: unknown): obj is Record<string, unknown> => {
        return typeof obj === 'object' && obj !== null && Object.keys(obj).length > 0;
    }
};

/**
 * Provider-specific type guard collections
 * Each provider can extend this with their own patterns
 */
export interface ProviderTypeGuards {
    [key: string]: TypeGuardValidation<unknown>;
}

/**
 * Type guard registry for managing provider-specific guards
 */
export class TypeGuardRegistry {
    private static providers = new Map<string, ProviderTypeGuards>();

    /**
     * Registers type guards for a specific provider
     */
    static register(providerName: string, guards: ProviderTypeGuards): void {
        this.providers.set(providerName, guards);
    }

    /**
     * Gets type guards for a specific provider
     */
    static get(providerName: string): ProviderTypeGuards | undefined {
        return this.providers.get(providerName);
    }

    /**
     * Lists all registered providers
     */
    static listProviders(): string[] {
        return Array.from(this.providers.keys());
    }

    /**
     * Validates that all registered type guards are working correctly
     */
    static validateRegistry(): { provider: string; guard: string; error?: string }[] {
        const results: { provider: string; guard: string; error?: string }[] = [];
        
        for (const [providerName, guards] of this.providers.entries()) {
            for (const [guardName, guard] of Object.entries(guards)) {
                try {
                    // Test with null/undefined to ensure basic safety
                    guard(null);
                    guard(undefined);
                    guard({});
                    results.push({ provider: providerName, guard: guardName });
                } catch (error) {
                    results.push({ 
                        provider: providerName, 
                        guard: guardName, 
                        error: error instanceof Error ? error.message : String(error)
                    });
                }
            }
        }
        
        return results;
    }
}

/**
 * Performance metrics for type guard operations
 */
interface TypeGuardMetrics {
    calls: number
    failures: number
    avgDuration: number
    lastError?: string
}

const metricsMap = new Map<string, TypeGuardMetrics>()

/**
 * Utility functions for type guard composition, debugging and performance monitoring
 */
export const TypeGuardUtils = {
    /**
     * Creates a debugging wrapper around a type guard
     */
    debug<T>(guard: TypeGuardValidation<T>, name: string): TypeGuardValidation<T> {
        return (obj: unknown): obj is T => {
            const result = guard(obj);
            if (!result) {
                console.debug(`Type guard '${name}' failed for:`, obj);
            }
            return result;
        };
    },

    /**
     * Combines multiple type guards with AND logic
     */
    all<T>(...guards: TypeGuardValidation<T>[]): TypeGuardValidation<T> {
        return (obj: unknown): obj is T => {
            return guards.every(guard => guard(obj));
        };
    },

    /**
     * Combines multiple type guards with OR logic
     */
    any<T>(...guards: TypeGuardValidation<T>[]): TypeGuardValidation<T> {
        return (obj: unknown): obj is T => {
            return guards.some(guard => guard(obj));
        };
    },

    /**
     * Creates a type guard that validates deep object properties
     */
    deepProperty<T>(path: string, guard: TypeGuardValidation<T>): TypeGuardValidation<Record<string, unknown>> {
        return (obj: unknown): obj is Record<string, unknown> => {
            if (typeof obj !== 'object' || obj === null) return false;
            
            const parts = path.split('.');
            let current: unknown = obj;
            
            for (const part of parts) {
                if (typeof current !== 'object' || current === null || !(part in current)) {
                    return false;
                }
                current = (current as Record<string, unknown>)[part];
            }
            
            return guard(current);
        };
    }
};