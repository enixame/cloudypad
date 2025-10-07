/**
 * Standardized telemetry event schema for dashboards and alerting
 * Consistent event structure across all validation operations
 */

export interface TelemetryEvent {
  /** Event identifier for categorization */
  event: EventType;
  /** Cloud provider context */
  provider: 'scaleway' | 'aws' | 'azure' | 'gcp' | 'paperspace' | 'linode' | 'ssh';
  /** Schema version for compatibility tracking */
  schemaVersion: string;
  /** Validation mode when event occurred */
  mode: 'strict' | 'lenient';
  /** ISO-8601 timestamp */
  ts: string;
  /** Correlation ID for request tracing */
  corr?: string;
  /** Event-specific data payload */
  data: EventData;
}

export type EventType = 
  | 'args.autorepair.region_from_zone'
  | 'args.autorepair.zone_region_mismatch'
  | 'args.normalization.input_cleanup'
  | 'args.validation.strict_failed'
  | 'args.validation.success'
  | 'args.migration.schema_upgraded'
  | 'args.migration.unavailable'
  | 'args.performance.slow_parse'
  | 'args.security.input_too_large'
  | 'args.security.regex_timeout';

export interface EventData {
  /** Input values (sanitized) */
  input?: Record<string, unknown>;
  /** Output values after processing */
  output?: Record<string, unknown>;
  /** Reason/context for the event */
  reason?: string;
  /** Performance metrics */
  performance?: {
    parseTimeMs: number;
    inputSizeBytes: number;
  };
  /** Error information */
  error?: {
    code: string;
    message: string;
    field?: string;
  };
}

/**
 * Factory for creating standardized telemetry events
 */
export class TelemetryEventFactory {
  constructor(
    private readonly provider: TelemetryEvent['provider'],
    private readonly schemaVersion: string,
    private readonly correlationId?: string
  ) {}

  /**
   * Create auto-repair event for region inference from zone
   */
  regionFromZoneRepair(
    mode: TelemetryEvent['mode'],
    zone: string,
    regionIn: string | undefined,
    regionOut: string
  ): TelemetryEvent {
    return this.createEvent('args.autorepair.region_from_zone', mode, {
      input: { zone, region: regionIn },
      output: { zone, region: regionOut },
      reason: regionIn ? 'inconsistent_region' : 'missing_region'
    });
  }

  /**
   * Create input normalization event
   */
  inputNormalization(
    mode: TelemetryEvent['mode'],
    originalInput: Record<string, unknown>,
    normalizedInput: Record<string, unknown>
  ): TelemetryEvent {
    return this.createEvent('args.normalization.input_cleanup', mode, {
      input: originalInput,
      output: normalizedInput,
      reason: 'boundary_cleanup'
    });
  }

  /**
   * Create strict validation failure event
   */
  strictValidationFailed(
    mode: TelemetryEvent['mode'],
    input: Record<string, unknown>,
    errorCode: string,
    errorMessage: string,
    field?: string
  ): TelemetryEvent {
    return this.createEvent('args.validation.strict_failed', mode, {
      input,
      reason: 'validation_error',
      error: {
        code: errorCode,
        message: errorMessage,
        field
      }
    });
  }

  /**
   * Create successful validation event
   */
  validationSuccess(
    mode: TelemetryEvent['mode'],
    input: Record<string, unknown>,
    parseTimeMs: number
  ): TelemetryEvent {
    return this.createEvent('args.validation.success', mode, {
      input,
      reason: 'validation_passed',
      performance: {
        parseTimeMs,
        inputSizeBytes: JSON.stringify(input).length
      }
    });
  }

  /**
   * Create schema migration event
   */
  schemaMigration(
    mode: TelemetryEvent['mode'],
    fromVersion: string,
    toVersion: string,
    migrationSuccess: boolean
  ): TelemetryEvent {
    return this.createEvent(
      migrationSuccess ? 'args.migration.schema_upgraded' : 'args.migration.unavailable',
      mode,
      {
        input: { fromVersion, toVersion },
        reason: migrationSuccess ? 'auto_migration' : 'migration_unavailable'
      }
    );
  }

  /**
   * Create performance warning event
   */
  slowParseWarning(
    mode: TelemetryEvent['mode'],
    input: Record<string, unknown>,
    parseTimeMs: number
  ): TelemetryEvent {
    return this.createEvent('args.performance.slow_parse', mode, {
      input,
      reason: 'performance_degradation',
      performance: {
        parseTimeMs,
        inputSizeBytes: JSON.stringify(input).length
      }
    });
  }

  /**
   * Create security event for oversized input
   */
  inputTooLarge(
    mode: TelemetryEvent['mode'],
    field: string,
    inputSize: number,
    maxSize: number
  ): TelemetryEvent {
    return this.createEvent('args.security.input_too_large', mode, {
      reason: 'dos_protection',
      error: {
        code: 'E_INPUT_TOO_LARGE',
        message: `Input too large for ${field}: ${inputSize} > ${maxSize} chars`,
        field
      },
      performance: {
        parseTimeMs: 0,
        inputSizeBytes: inputSize
      }
    });
  }

  private createEvent(
    event: EventType, 
    mode: TelemetryEvent['mode'], 
    data: EventData
  ): TelemetryEvent {
    return {
      event,
      provider: this.provider,
      schemaVersion: this.schemaVersion,
      mode,
      ts: new Date().toISOString(),
      corr: this.correlationId,
      data
    };
  }
}

/**
 * Telemetry collector interface for different backends
 */
export interface TelemetryCollector {
  collect(event: TelemetryEvent): void | Promise<void>;
}

/**
 * Console telemetry collector for development
 */
export class ConsoleTelemetryCollector implements TelemetryCollector {
  collect(event: TelemetryEvent): void {
    console.info(`[Telemetry] ${event.event}`, {
      provider: event.provider,
      mode: event.mode,
      reason: event.data.reason,
      ts: event.ts
    });
  }
}

/**
 * Buffered telemetry collector for production (batch sends)
 */
export class BufferedTelemetryCollector implements TelemetryCollector {
  private buffer: TelemetryEvent[] = [];
  private flushInterval?: NodeJS.Timeout;

  constructor(
    private readonly batchSize = 100,
    private readonly flushIntervalMs = 30_000,
    private readonly sender: (events: TelemetryEvent[]) => Promise<void>
  ) {
    this.startFlushTimer();
  }

  collect(event: TelemetryEvent): void {
    this.buffer.push(event);
    
    if (this.buffer.length >= this.batchSize) {
      this.flush();
    }
  }

  private startFlushTimer(): void {
    this.flushInterval = setInterval(() => {
      if (this.buffer.length > 0) {
        this.flush();
      }
    }, this.flushIntervalMs);
  }

  private async flush(): Promise<void> {
    if (this.buffer.length === 0) return;
    
    const events = this.buffer.splice(0);
    try {
      await this.sender(events);
    } catch (error) {
      console.error('Failed to send telemetry events:', error);
    }
  }

  destroy(): void {
    if (this.flushInterval) {
      clearInterval(this.flushInterval);
    }
    this.flush(); // Final flush
  }
}