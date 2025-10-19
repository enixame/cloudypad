// Shared constants for Scaleway provider

// IOPS tier literal types for compile-time safety
export const SCALEWAY_FALLBACK_IOPS_TIERS = [5000, 15000] as const
export type ScalewayIopsTier = typeof SCALEWAY_FALLBACK_IOPS_TIERS[number]

// Default IOPS tier for SBS when API discovery is unavailable
export const SCALEWAY_DEFAULT_IOPS: ScalewayIopsTier = 5000

// Human-readable labels for known tiers
export const SCALEWAY_IOPS_LABELS = {
  5000: '5000 (standard)',
  15000: '15000 (performance, higher cost)',
} as const satisfies Record<ScalewayIopsTier, string>
