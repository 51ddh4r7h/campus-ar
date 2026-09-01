/**
 * Layout-derived safety margins.
 *
 * The game was first tuned for stops 60 m or more apart. A compact play area
 * breaks that quietly rather than loudly: a GPS fix accurate to 35 m cannot
 * distinguish two stops 30 m apart, so a player standing in the right place can
 * validate against the wrong one — or be told to finish an earlier scene while
 * already standing at the current one.
 *
 * So nothing distance-sensitive is hard-coded to one campus. Every such
 * threshold is derived from the coordinates actually in play: pack the stops
 * closer and the geofences, the accuracy gate, the heat range and the minimum
 * leg time all tighten to match, automatically.
 */

import {haversineM, type LatLng} from './geo'

/** Below this the stops cannot be told apart by consumer GPS at all. */
export const ABSOLUTE_MIN_SPACING_M = 18
/** A geofence never shrinks below this, or players can never satisfy it. */
export const MIN_RADIUS_M = 6
/** Nor grows beyond it, however remote a stop is. */
export const MAX_RADIUS_M = 18

/** Fraction of the gap to the nearest other stop that a geofence may occupy. */
const RADIUS_SHARE = 0.35
/** A fix must be at least this much finer than the gap to be trusted. */
const ACCURACY_SHARE = 0.4
/** Heat only carries information within this multiple of the tightest gap. */
const HEAT_SHARE = 1.5

export interface LayoutLimits {
  /** Closest pair of stops anywhere in the pool, in metres. */
  minSpacingM: number
  /** Reject a fix reported worse than this — it cannot resolve the layout. */
  maxAccuracyM: number
  /** Beyond this from the target, heat reads a flat cold. */
  heatRangeM: number
  /** Floor on how fast any leg may be completed. */
  minLegMs: number
  /** Anything that makes the layout unplayable, in plain words. */
  warnings: readonly string[]
}

const clamp = (n: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, n))

/** Distance from `p` to the closest other point in the pool. */
export const nearestNeighbourM = (p: LatLng, all: readonly LatLng[]): number => {
  let best = Infinity
  for (const q of all) {
    if (q === p) continue
    const d = haversineM(p, q)
    if (d < best) best = d
  }
  return best
}

/**
 * The largest geofence this stop can carry without reaching into its
 * neighbour's, bounded so it stays both satisfiable and honest.
 */
export const safeRadiusM = (p: LatLng, all: readonly LatLng[], requestedM: number): number => {
  const share = nearestNeighbourM(p, all) * RADIUS_SHARE
  return Math.round(clamp(Math.min(requestedM, share), MIN_RADIUS_M, MAX_RADIUS_M))
}

/** Every threshold that depends on how tightly the stops are packed. */
export const deriveLimits = (all: readonly LatLng[]): LayoutLimits => {
  const spacings = all.map((p) => nearestNeighbourM(p, all)).filter((d) => Number.isFinite(d))
  const minSpacingM = spacings.length > 0 ? Math.min(...spacings) : Infinity
  const warnings: string[] = []

  if (minSpacingM < ABSOLUTE_MIN_SPACING_M) {
    warnings.push(
      `Two stops are ${minSpacingM.toFixed(0)} m apart — under the ${ABSOLUTE_MIN_SPACING_M} m ` +
        'that consumer GPS can reliably tell apart. Move one, or merge them into a single stop.',
    )
  }

  // A walk of the tightest gap, at a stroll, halved — enough to catch a
  // teleport without refusing an honest short hop between neighbouring stops.
  const strollMs = (minSpacingM / 1.3) * 1000 * 0.5

  return {
    minSpacingM,
    maxAccuracyM: Math.round(clamp(minSpacingM * ACCURACY_SHARE, 10, 35)),
    heatRangeM: Math.round(clamp(minSpacingM * HEAT_SHARE, 30, 160)),
    minLegMs: Math.round(clamp(strollMs, 5_000, 25_000)),
    warnings,
  }
}
