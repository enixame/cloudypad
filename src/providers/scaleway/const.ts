// Shared constants for Scaleway provider

// Default and fallback IOPS tiers for SBS when API discovery is unavailable
export const SCALEWAY_DEFAULT_IOPS = 5000
export const SCALEWAY_FALLBACK_IOPS_TIERS: number[] = [5000, 15000]

// Human-readable labels for known tiers
export const SCALEWAY_IOPS_LABELS: Record<number, string> = {
  5000: '5000 (standard)',
  15000: '15000 (performance, higher cost)'
}
