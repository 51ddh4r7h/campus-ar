/**
 * Continuous "signal heat" math — the intuitive replacement for discrete
 * proximity bands.
 *
 * Heat is 0–100, piecewise-linear in log(distance) so it moves fast when
 * you're close and crawls when you're far (matches how a hunt *feels*).
 * Anchor pairs were chosen so the old band boundaries land on round heat
 * values: 100 m → 18 (Chilly), 55 m → 40 (Warm), 25 m → 62 (Hot),
 * inside the radius → 100 (On set).
 */

export type HeatBand = 0 | 1 | 2 | 3 | 4

/** Log-interpolate heat between two (distance, heat) anchors. */
const logLerp = (d: number, dNear: number, hNear: number, dFar: number, hFar: number): number => {
  const t = Math.log10(dNear / d) / Math.log10(dNear / dFar)
  return hNear + t * (hFar - hNear)
}

/** Distance (m) → heat (0–100). Inside the radius pins to 100. */
export const heatFromDistance = (distanceM: number, radiusM: number): number => {
  if (distanceM <= radiusM) return 100
  if (distanceM >= 1000) return 0
  if (distanceM > 100) return Math.max(0, logLerp(distanceM, 100, 18, 1000, 0))
  if (distanceM > 55) return logLerp(distanceM, 55, 40, 100, 18)
  if (distanceM > 25) return logLerp(distanceM, 25, 62, 55, 40)
  return Math.min(96, logLerp(distanceM, Math.max(radiusM, 8), 96, 25, 62))
}

/** Heat → display band (indexes BAND_UI). */
export const bandFromHeat = (heat: number): HeatBand => {
  if (heat >= 100) return 4
  if (heat >= 62) return 3
  if (heat >= 40) return 2
  if (heat >= 18) return 1
  return 0
}

/** Exponential glide toward the target heat — the thumb should feel alive. */
export const glide = (current: number, target: number, factor = 0.35): number =>
  current + (target - current) * factor
