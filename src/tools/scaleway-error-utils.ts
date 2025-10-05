/**
 * Scaleway-specific error handling utilities
 * Centralizes error normalization, type guards, and common error patterns
 */

export interface ScalewayErrorDetails {
    message: string;
    originalError: unknown;
    isRetryable: boolean;
    errorType: 'validation' | 'network' | 'resource' | 'critical' | 'unknown';
}

/**
 * Scaleway error handling utilities
 * Provides standardized error processing for all Scaleway operations
 */
export class ScalewayErrorUtils {
    /**
     * Normalizes any error to a standardized ScalewayErrorDetails format
     * @param error - The error to normalize (can be Error, string, or unknown)
     * @param context - Optional context for better error messages
     * @returns Normalized error details with retry information
     */
    static normalizeError(error: unknown, context?: string): ScalewayErrorDetails {
        const message = this.extractErrorMessage(error);
        const contextPrefix = context ? `${context}: ` : '';
        
        return {
            message: `${contextPrefix}${message}`,
            originalError: error,
            isRetryable: this.isRetryableError(message),
            errorType: this.categorizeError(message)
        };
    }

    /**
     * Extracts a string message from any error type
     * @param error - The error to extract message from
     * @returns String representation of the error
     */
    static extractErrorMessage(error: unknown): string {
        if (error instanceof Error) {
            return error.message;
        }
        if (typeof error === 'string') {
            return error;
        }
        return String(error);
    }

    /**
     * Creates a standardized Error with Scaleway context
     * @param message - Error message
     * @param originalError - Optional original error for cause chain
     * @returns New Error with standardized format
     */
    static createScalewayError(message: string, originalError?: unknown): Error {
        const error = new Error(message);
        if (originalError) {
            error.cause = originalError;
        }
        return error;
    }

    /**
     * Wraps Scaleway SDK operations with standardized error handling
     * @param operation - The async operation to execute
     * @param context - Context description for error messages
     * @returns Promise with normalized error handling
     */
    static async wrapScalewayOperation<T>(
        operation: () => Promise<T>,
        context: string
    ): Promise<T> {
        try {
            return await operation();
        } catch (error) {
            const normalized = this.normalizeError(error, context);
            throw this.createScalewayError(normalized.message, error);
        }
    }

    /**
     * Determines if an error is retryable based on common Scaleway error patterns
     * @param errorMessage - The error message to analyze
     * @returns true if the error might succeed on retry
     */
    private static isRetryableError(errorMessage: string): boolean {
        const retryablePatterns = [
            'in_use',
            'protected_resource',
            '412',
            'ResourceNotFoundError',
            'instance_volume',
            '404',
            'network',
            'timeout',
            'temporary'
        ];

        return retryablePatterns.some(pattern => 
            errorMessage.toLowerCase().includes(pattern.toLowerCase())
        );
    }

    /**
     * Categorizes errors by type for better handling and monitoring
     * @param errorMessage - The error message to categorize
     * @returns Error category
     */
    private static categorizeError(errorMessage: string): ScalewayErrorDetails['errorType'] {
        const lowerMessage = errorMessage.toLowerCase();

        if (lowerMessage.includes('invalid') || lowerMessage.includes('validation')) {
            return 'validation';
        }
        if (lowerMessage.includes('network') || lowerMessage.includes('timeout') || lowerMessage.includes('connection')) {
            return 'network';
        }
        if (lowerMessage.includes('not found') || lowerMessage.includes('404') || lowerMessage.includes('in_use')) {
            return 'resource';
        }
        if (lowerMessage.includes('critical') || lowerMessage.includes('failed to delete')) {
            return 'critical';
        }
        
        return 'unknown';
    }

    /**
     * Type guard to check if an error is a standard Error instance
     * @param error - The value to check
     * @returns true if the value is an Error instance
     */
    static isError(error: unknown): error is Error {
        return error instanceof Error;
    }

    /**
     * Validates Scaleway UUID format
     * @param id - The ID to validate
     * @returns true if the ID is a valid UUID format
     */
    static isValidUUID(id: string): boolean {
        const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
        return uuidRegex.test(id);
    }

    /**
     * Validates Scaleway snapshot name format
     * @param name - The snapshot name to validate
     * @returns true if the name follows Scaleway naming conventions
     */
    static isValidSnapshotName(name: string): boolean {
        return /^[a-zA-Z0-9-_]{1,63}$/.test(name);
    }

    /**
     * Creates a validation error for invalid snapshot names
     * @param name - The invalid snapshot name
     * @returns Standardized validation error
     */
    static createInvalidSnapshotNameError(name: string): Error {
        return this.createScalewayError(
            `Invalid snapshot name: "${name}". It must match [a-zA-Z0-9-_] and length ≤ 63.`
        );
    }

    /**
     * Creates a validation error for invalid UUIDs
     * @param id - The invalid UUID
     * @param context - Optional context (e.g., "volume ID", "server ID")
     * @returns Standardized validation error
     */
    static createInvalidUUIDError(id: string, context = 'ID'): Error {
        return this.createScalewayError(`Invalid ${context} format: ${id}`);
    }
}