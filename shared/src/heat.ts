/**
 * "Signal heat" — a continuous 0-100 warmth value from distance to the current
 * target. Piecewise-linear in log(distance) so it moves fast up close and
 * crawls when far. Beyond HEAT_ACTIVE_RANGE_M it reads a flat cold — the clue
 * still has to do the work of getting you to the right area.
 */

import {HEAT_ACTIVE_RANGE_M} from './config'

export type HeatBand = 0 | 1 | 2 | 3 | 4

export const BAND_WORDS = {
  0: 'Cold',
  1: 'Chilly',
  2: 'Warm',
  3: 'Hot',
  4: "You're close",
} satisfies Record<HeatBand, string>

const logLerp = (d: number, dNear: number, hNear: number, dFar: number, hFar: number): number => {
  const t = Math.log10(dNear / d) / Math.log10(dNear / dFar)
  return hNear + t * (hFar - hNear)
}

/** Distance (m) → heat (0-100). Inside the radius pins to 100. */
export const heatFromDistance = (distanceM: number, radiusM: number): number => {
  if (distanceM <= radiusM) return 100
  if (distanceM >= HEAT_ACTIVE_RANGE_M) return 0
  if (distanceM > 100) return Math.max(0, logLerp(distanceM, 100, 20, HEAT_ACTIVE_RANGE_M, 0))
  if (distanceM > 55) return logLerp(distanceM, 55, 42, 100, 20)
  if (distanceM > 25) return logLerp(distanceM, 25, 64, 55, 42)
  return Math.min(96, logLerp(distanceM, Math.max(radiusM, 8), 96, 25, 64))
}

export const bandFromHeat = (heat: number): HeatBand => {
  if (heat >= 100) return 4
  if (heat >= 64) return 3
  if (heat >= 42) return 2
  if (heat >= 20) return 1
  return 0
}

/** Exponential glide toward a target value — for a display that feels alive. */
export const glide = (current: number, target: number, factor = 0.32): number =>
  current + (target - current) * factor
