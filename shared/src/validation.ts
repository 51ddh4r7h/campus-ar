/**
 * Arrival validation — pure. The server calls this with the player's recent
 * position samples and their session state; it returns pass or a typed failure.
 * Nothing here touches storage or the network.
 */

import {haversineM, impliedSpeedMps, type LatLng} from './geo'
import {VALIDATION} from './config'
import {LAYOUT} from './content'
import type {GameLocation, GeoSample, ValidationFailure} from './types'

export interface ArrivalContext {
  /** Ordered locations for this player's route, resolved. */
  routeStops: readonly GameLocation[]
  /** 1-based level the player is currently on. */
  currentLevel: number
  /** ms timestamp of the previous level's completion, or the hunt start for L1. */
  prevReachedTsMs: number
  /** Recent device/simulator samples, any order. */
  samples: readonly GeoSample[]
  nowMs: number
}

export interface ArrivalOutcome {
  ok: boolean
  failure: ValidationFailure | null
  /** When ok, the timestamp credited as the arrival (latest qualifying fix). */
  reachedTsMs: number | null
  /** True when a check passed but looked suspicious (recorded, not blocked here). */
  flagged: boolean
  /** Continuous time held inside the target radius so far, ms (for a dwell UI). */
  insideMs: number
}

const fail = (failure: ValidationFailure, insideMs = 0): ArrivalOutcome => ({
  ok: false,
  failure,
  reachedTsMs: null,
  flagged: false,
  insideMs,
})

const fresh = (s: GeoSample, nowMs: number): boolean =>
  nowMs - s.tsMs <= VALIDATION.maxFixAgeMs && s.tsMs <= nowMs

/**
 * A fix is only trustworthy if it is finer than the gap between neighbouring
 * stops — otherwise it cannot say *which* stop you are standing at. That bar
 * is derived from the layout, so a tighter campus demands a better fix.
 */
const reliable = (s: GeoSample): boolean => s.simulated || s.accuracyM <= LAYOUT.maxAccuracyM

const insideOf = (s: GeoSample, loc: GameLocation): boolean =>
  haversineM(s, loc) <= loc.radiusM

/** Longest continuously-inside span across the qualifying samples, in ms. */
const dwellSpanMs = (insideSamples: GeoSample[]): number => {
  if (insideSamples.length < 2) return 0
  const ts = insideSamples.map((s) => s.tsMs).sort((a, b) => a - b)
  return ts[ts.length - 1]! - ts[0]!
}

export const evaluateArrival = (ctx: ArrivalContext): ArrivalOutcome => {
  const {routeStops, currentLevel, prevReachedTsMs, samples, nowMs} = ctx

  const target = routeStops[currentLevel - 1]
  if (!target) return fail('not_in_progress')

  const usable = samples.filter((s) => fresh(s, nowMs) && reliable(s))
  const insideTarget = usable.filter((s) => insideOf(s, target))

  if (insideTarget.length === 0) {
    // Distinguish "you're standing at a later stop" from "nowhere near it".
    // On a compact campus a single drifting fix can land inside a neighbour, so
    // require most of the recent fixes to agree before accusing anyone of
    // skipping ahead — being wrongly told to finish an earlier scene while
    // standing at the right one is the worst failure we can hand a player.
    const atFutureStop = routeStops
      .slice(currentLevel)
      .some((loc) => usable.filter((s) => insideOf(s, loc)).length * 2 > usable.length)
    if (atFutureStop) return fail('level_locked')
    // Are they physically at the target but with only poor-accuracy fixes?
    const nearWithBadFix = samples.some(
      (s) => fresh(s, nowMs) && !reliable(s) && insideOf(s, target),
    )
    return fail(nearWithBadFix ? 'signal' : 'wrong_location')
  }

  const insideMs = dwellSpanMs(insideTarget)
  if (insideMs < VALIDATION.dwellMs) return fail('dwell', insideMs)

  const reachedTsMs = Math.max(...insideTarget.map((s) => s.tsMs))
  const legMs = reachedTsMs - prevReachedTsMs

  // Derived, not fixed: a 30 m hop between neighbouring stops is a legitimate
  // 25-second walk, and must not be refused as teleporting.
  if (legMs < LAYOUT.minLegMs) return fail('too_fast', insideMs)

  let flagged = false
  if (currentLevel > 1) {
    const prevStop: LatLng = routeStops[currentLevel - 2]!
    const speed = impliedSpeedMps(haversineM(prevStop, target), legMs)
    flagged = speed > VALIDATION.maxTravelSpeedMps
  }

  return {ok: true, failure: null, reachedTsMs, flagged, insideMs}
}
