/**
 * Proximity rules — the hunt's warmth logic as pure functions.
 *
 * Owns the product's differentiating rules in one place:
 *  - reliability gate (simulated fixes always pass; real fixes need ≤60 m accuracy)
 *  - radius entry (inside an unfound spot → unlockable)
 *  - continuous heat (0–100, log-distance)
 *  - the 45 m ambiguity rule (only name a spot when it is *clearly* closest)
 *  - far-away detection (non-simulated fix kilometres from every set)
 *
 * Pure in/out: fix + runs → verdict. No DOM, no state.
 */

import type {FilmSpot} from './data/spots'
import {bandFromHeat, heatFromDistance, type HeatBand} from './heat'
import type {SpotRun} from './hunt'
import {distanceM, type GeoFix} from './location'

/** True when a fix is trustworthy enough to unlock a spot. */
export const reliable = (fix: GeoFix): boolean => fix.simulated || fix.accuracyM <= 60

export const isInside = (fix: GeoFix, spot: FilmSpot): boolean =>
  reliable(fix) && distanceM(fix, spot.lat, spot.lng) <= spot.radiusM

export interface ProximityVerdict {
  /** Target heat 0–100 — the display glides toward it. */
  heat: number
  band: HeatBand
  /** Spot whose radius the player stands in (reliable fix), else null. */
  insideSpot: FilmSpot | null
  /** Spot to name in copy — only when clearly closest (45 m rule, ≤160 m). */
  namedSpot: FilmSpot | null
  /** Fix too fuzzy to trust — copy asks for a steadier read. */
  fuzzy: boolean
  /** Nearest set is kilometres away (real GPS) — copy suggests the demo. */
  farAway: boolean
}

export const evaluateProximity = (fix: GeoFix, runs: SpotRun[]): ProximityVerdict => {
  const unfound = runs.filter((r) => r.status !== 'found')
  if (unfound.length === 0) {
    return {heat: 100, band: 4, insideSpot: null, namedSpot: null, fuzzy: false, farAway: false}
  }

  const scored = unfound
    .map((r) => ({run: r, dist: distanceM(fix, r.spot.lat, r.spot.lng)}))
    .sort((a, b) => a.dist - b.dist)
  const nearest = scored[0]!

  if (nearest.dist <= nearest.run.spot.radiusM && reliable(fix)) {
    return {
      heat: 100,
      band: 4,
      insideSpot: nearest.run.spot,
      namedSpot: nearest.run.spot,
      fuzzy: false,
      farAway: false,
    }
  }

  // Ambiguity rule: only name a spot when the second-closest is >45 m behind.
  const second = scored[1]
  const clear = second === undefined || second.dist - nearest.dist > 45
  const heat = heatFromDistance(nearest.dist, nearest.run.spot.radiusM)

  return {
    heat,
    band: bandFromHeat(heat),
    insideSpot: null,
    namedSpot: clear && nearest.dist <= 160 ? nearest.run.spot : null,
    fuzzy: !reliable(fix),
    farAway: !fix.simulated && nearest.dist > 2000,
  }
}
