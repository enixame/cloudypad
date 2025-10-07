/**
 * Configuration for Scaleway validation behavior
 * Controls strict vs lenient parsing with environment-based defaults
 */

export type ValidationMode = 'strict' | 'lenient';

export interface ValidationConfig {
  mode: ValidationMode;
  enableTelemetry: boolean;
  logger?: ValidationLogger;
}

export interface ValidationLogger {
  logRepair(operation: string, original: unknown, repaired: unknown, context: string): void;
  countFallback(reason: string): void;
}

/**
 * Default validation config based on environment
 */
export function getDefaultValidationConfig(): ValidationConfig {
  const isProduction = process.env.NODE_ENV === 'production';
  const isDevelopment = process.env.NODE_ENV === 'development';
  
  return {
    // Production: strict by default, dev: lenient for better DX
    mode: isProduction ? 'strict' : 'lenient',
    // Enable telemetry in production to monitor dirty inputs
    enableTelemetry: isProduction || isDevelopment,
  };
}

/**
 * Console-based logger for development/debugging
 */
export const consoleValidationLogger: ValidationLogger = {
  logRepair(operation: string, original: unknown, repaired: unknown, context: string): void {
    console.info(`[Scaleway Validation] ${operation}: ${JSON.stringify(original)} → ${JSON.stringify(repaired)} (${context})`);
  },
  
  countFallback(reason: string): void {
    console.info(`[Scaleway Validation] Fallback triggered: ${reason}`);
  },
};

/**
 * Silent logger for production (implement your own metrics collection)
 */
export const silentValidationLogger: ValidationLogger = {
  logRepair: () => {},
  countFallback: () => {},
};