/**
 * "Signal heat" — a continuous 0-100 warmth value from distance to the current
 * target. Logarithmic in distance so it moves fast up close and crawls when
 * far. Beyond the layout's heat range it reads a flat cold, so the clip still
 * has to do the work of telling you *which* place you are looking for; the
 * meter only helps you close the last stretch. On a compact campus that range
 * shrinks automatically, which is what stops it becoming a homing beacon.
 */

import {LAYOUT} from './content'

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

/**
 * Distance (m) → heat (0-100). Inside the fence pins to 100; at the edge of the
 * informative range it reads 0. Expressed against those two ends rather than
 * fixed distances, so it behaves the same on a tight campus as a sprawling one.
 */
export const heatFromDistance = (distanceM: number, radiusM: number): number => {
  const near = Math.max(radiusM, 5)
  const far = Math.max(LAYOUT.heatRangeM, near * 2)
  if (distanceM <= near) return 100
  if (distanceM >= far) return 0
  return Math.max(0, Math.min(96, logLerp(distanceM, near, 96, far, 0)))
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
