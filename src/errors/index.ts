/**
 * Cloudy Pad Error System Module
 * Tree-shakable exports for error handling
 */

// Core error taxonomy
export {
  ErrorCategory,
  ErrorSeverity,
  ErrorEnvironment,
  ErrorCodeRegistry,
  CloudyPadError,
  ValidationError,
  MigrationError,
  ConfigurationError,
  ProviderError,
  InfrastructureError,
  createError,
  isCloudyPadError,
  extractErrorDetails,
  type ErrorCode
} from '../core/errors/taxonomy';

// Scaleway-specific errors
// Scaleway error exports removed - basic error system from core only