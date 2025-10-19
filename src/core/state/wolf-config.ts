/**
 * Wolf configuration type and helpers.
 */

export type WolfConfig = {
  enable: boolean;
};

/**
 * Convert a boolean enabled flag to WolfConfig or null.
 */
export function toWolfConfig(enabled?: boolean): WolfConfig | null {
  return enabled ? { enable: true } : null;
}

/**
 * Redact sensitive fields from objects for logging (passwords, tokens, secrets, keys).
 */
export function redactSecrets<T extends object>(obj: T): T {
  return JSON.parse(JSON.stringify(obj, (key, value) => {
    if (typeof value === 'string' && /password|token|secret|key/i.test(key)) {
      return '<redacted>';
    }
    return value;
  })) as T;
}
