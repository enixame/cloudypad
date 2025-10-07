/**
 * Error taxonomy system for Cloudy Pad
 * Provides structured error codes with dev/prod differentiation
 */

/**
 * Error categories for systematic classification
 */
export enum ErrorCategory {
  VALIDATION = 'VALIDATION',
  MIGRATION = 'MIGRATION', 
  CONFIGURATION = 'CONFIGURATION',
  PROVIDER = 'PROVIDER',
  INFRASTRUCTURE = 'INFRASTRUCTURE',
  AUTHENTICATION = 'AUTHENTICATION',
  NETWORK = 'NETWORK',
  SYSTEM = 'SYSTEM'
}

/**
 * Error severity levels
 */
export enum ErrorSeverity {
  CRITICAL = 'CRITICAL',  // System cannot continue
  ERROR = 'ERROR',        // Operation failed but recoverable
  WARNING = 'WARNING',    // Potential issue but operation succeeded
  INFO = 'INFO'          // Informational message
}

/**
 * Environment context for error messages
 */
export enum ErrorEnvironment {
  DEVELOPMENT = 'DEVELOPMENT',
  PRODUCTION = 'PRODUCTION',
  TEST = 'TEST'
}

/**
 * Structured error code with metadata
 */
export interface ErrorCode {
  readonly code: string;
  readonly category: ErrorCategory;
  readonly severity: ErrorSeverity;
  readonly devMessage: string;
  readonly prodMessage: string;
  readonly possibleCauses?: string[];
  readonly suggestions?: string[];
  readonly docsUrl?: string;
}

/**
 * Complete registry of all error codes
 */
export class ErrorCodeRegistry {
  private static codes: Map<string, ErrorCode> = new Map();

  static register(errorCode: ErrorCode): void {
    this.codes.set(errorCode.code, errorCode);
  }

  static get(code: string): ErrorCode | undefined {
    return this.codes.get(code);
  }

  static getAllCodes(): ErrorCode[] {
    return Array.from(this.codes.values());
  }

  static getByCategory(category: ErrorCategory): ErrorCode[] {
    return this.getAllCodes().filter(error => error.category === category);
  }

  static getBySeverity(severity: ErrorSeverity): ErrorCode[] {
    return this.getAllCodes().filter(error => error.severity === severity);
  }
}

/**
 * Base structured error class
 */
export abstract class CloudyPadError extends Error {
  readonly code: string;
  readonly category: ErrorCategory;
  readonly severity: ErrorSeverity;
  readonly timestamp: string;
  readonly context: Record<string, unknown>;
  readonly originalError?: Error;

  constructor(
    errorCode: ErrorCode,
    context: Record<string, unknown> = {},
    originalError?: Error,
    environment: ErrorEnvironment = ErrorEnvironment.DEVELOPMENT
  ) {
    const message = environment === ErrorEnvironment.PRODUCTION 
      ? errorCode.prodMessage 
      : errorCode.devMessage;
    
    super(message);
    
    this.name = this.constructor.name;
    this.code = errorCode.code;
    this.category = errorCode.category;
    this.severity = errorCode.severity;
    this.timestamp = new Date().toISOString();
    this.context = context;
    this.originalError = originalError;

    // Maintain proper stack trace
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, this.constructor);
    }
  }

  /**
   * Get user-friendly error details
   */
  getDetails(environment: ErrorEnvironment = ErrorEnvironment.DEVELOPMENT): {
    code: string;
    message: string;
    suggestions?: string[];
    docsUrl?: string;
    context: Record<string, unknown>;
  } {
    const errorCode = ErrorCodeRegistry.get(this.code);
    
    return {
      code: this.code,
      message: this.message,
      suggestions: errorCode?.suggestions,
      docsUrl: errorCode?.docsUrl,
      context: environment === ErrorEnvironment.PRODUCTION ? {} : this.context
    };
  }

  /**
   * Serialize for telemetry/logging
   */
  toJSON(): Record<string, unknown> {
    return {
      name: this.name,
      code: this.code,
      category: this.category,
      severity: this.severity,
      message: this.message,
      timestamp: this.timestamp,
      context: this.context,
      stack: this.stack,
      originalError: this.originalError?.message
    };
  }
}

/**
 * Validation-specific errors
 */
export class ValidationError extends CloudyPadError {
  constructor(
    errorCode: ErrorCode,
    context: Record<string, unknown> = {},
    originalError?: Error,
    environment: ErrorEnvironment = ErrorEnvironment.DEVELOPMENT
  ) {
    super(errorCode, context, originalError, environment);
  }
}

/**
 * Migration-specific errors  
 */
export class MigrationError extends CloudyPadError {
  constructor(
    errorCode: ErrorCode,
    context: Record<string, unknown> = {},
    originalError?: Error,
    environment: ErrorEnvironment = ErrorEnvironment.DEVELOPMENT
  ) {
    super(errorCode, context, originalError, environment);
  }
}

/**
 * Configuration-specific errors
 */
export class ConfigurationError extends CloudyPadError {
  constructor(
    errorCode: ErrorCode,
    context: Record<string, unknown> = {},
    originalError?: Error,
    environment: ErrorEnvironment = ErrorEnvironment.DEVELOPMENT
  ) {
    super(errorCode, context, originalError, environment);
  }
}

/**
 * Provider-specific errors
 */
export class ProviderError extends CloudyPadError {
  constructor(
    errorCode: ErrorCode,
    context: Record<string, unknown> = {},
    originalError?: Error,
    environment: ErrorEnvironment = ErrorEnvironment.DEVELOPMENT
  ) {
    super(errorCode, context, originalError, environment);
  }
}

/**
 * Infrastructure-specific errors
 */
export class InfrastructureError extends CloudyPadError {
  constructor(
    errorCode: ErrorCode,
    context: Record<string, unknown> = {},
    originalError?: Error,
    environment: ErrorEnvironment = ErrorEnvironment.DEVELOPMENT
  ) {
    super(errorCode, context, originalError, environment);
  }
}

/**
 * Helper to create error instances with proper typing
 */
export function createError(
  errorCode: ErrorCode,
  context: Record<string, unknown> = {},
  originalError?: Error,
  environment: ErrorEnvironment = ErrorEnvironment.DEVELOPMENT
): CloudyPadError {
  switch (errorCode.category) {
    case ErrorCategory.VALIDATION:
      return new ValidationError(errorCode, context, originalError, environment);
    case ErrorCategory.MIGRATION:
      return new MigrationError(errorCode, context, originalError, environment);
    case ErrorCategory.CONFIGURATION:
      return new ConfigurationError(errorCode, context, originalError, environment);
    case ErrorCategory.PROVIDER:
      return new ProviderError(errorCode, context, originalError, environment);
    case ErrorCategory.INFRASTRUCTURE:
      return new InfrastructureError(errorCode, context, originalError, environment);
    default:
      // Create a concrete implementation for unknown categories
      return new (class extends CloudyPadError {})(errorCode, context, originalError, environment);
  }
}

/**
 * Type guard for CloudyPad errors
 */
export function isCloudyPadError(error: unknown): error is CloudyPadError {
  return error instanceof CloudyPadError;
}

/**
 * Extract error details safely from any error
 */
export function extractErrorDetails(
  error: unknown,
  environment: ErrorEnvironment = ErrorEnvironment.DEVELOPMENT
): {
  code?: string;
  message: string;
  category?: ErrorCategory;
  severity?: ErrorSeverity;
  context?: Record<string, unknown>;
} {
  if (isCloudyPadError(error)) {
    const details = error.getDetails(environment);
    return {
      code: details.code,
      message: details.message,
      category: error.category,
      severity: error.severity,
      context: details.context
    };
  }

  if (error instanceof Error) {
    return {
      message: error.message,
      context: environment === ErrorEnvironment.PRODUCTION ? {} : { stack: error.stack }
    };
  }

  return {
    message: String(error),
    context: {}
  };
}