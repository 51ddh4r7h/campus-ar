/**
 * Par-time scoring. Every route gets a fair expected time from its walking
 * distance and clue difficulty; a player's score is their elapsed time (plus
 * hint penalties) minus that par. Lower is better; negative means under par.
 */

import {haversineM, type LatLng} from './geo'
import type {GameLocation, ParConstants, Session} from './types'
import {LEVEL_COUNT} from './config'

/** Expected walking time between two points, ms. */
export const walkParMs = (from: LatLng, to: LatLng, walkSpeedMps: number): number =>
  Math.round((haversineM(from, to) / walkSpeedMps) * 1000)

export interface RoutePar {
  totalMs: number
  legMs: [number, number, number, number, number]
  /** Walk component only, used to band routes during pool generation. */
  walkOnlyMs: number
}

/**
 * Par for an ordered list of exactly LEVEL_COUNT stops, starting from a common
 * point. Each leg = walk(prev → stop) + identify(difficulty) + dwell.
 */
export const routePar = (
  stops: readonly GameLocation[],
  startPoint: LatLng,
  pc: ParConstants,
): RoutePar => {
  if (stops.length !== LEVEL_COUNT) {
    throw new Error(`routePar: expected ${LEVEL_COUNT} stops, got ${stops.length}`)
  }
  const legMs: number[] = []
  let walkOnlyMs = 0
  for (let i = 0; i < stops.length; i++) {
    const stop = stops[i]!
    const from: LatLng = i === 0 ? startPoint : stops[i - 1]!
    const walk = walkParMs(from, stop, pc.walkSpeedMps)
    walkOnlyMs += walk
    legMs.push(walk + pc.identifyParMs[stop.difficulty] + pc.dwellParMs)
  }
  // SAFETY: the guard above rejects any `stops` length other than LEVEL_COUNT,
  // so `legMs` has exactly LEVEL_COUNT (5) entries here.
  const legMsTuple = legMs as [number, number, number, number, number]
  return {
    totalMs: legMs.reduce((a, b) => a + b, 0),
    legMs: legMsTuple,
    walkOnlyMs,
  }
}

/** score = elapsed + hint penalties − route par. */
export const sessionScoreMs = (
  elapsedMs: number,
  penaltyMs: number,
  routeParTotalMs: number,
): number => elapsedMs + penaltyMs - routeParTotalMs

/**
 * How long a hunt has actually been running.
 *
 * The one place this is worked out. It used to be plain wall-clock —
 * `(endTsMs ?? now) - startTsMs` — computed separately in the client's clock and
 * in the engine, which meant a session left open kept accruing time forever,
 * and pausing could only ever have been cosmetic. Paused time is subtracted,
 * including the pause currently in progress, so the two agree by construction.
 */
export const elapsedMsOf = (
  session: Pick<Session, 'startTsMs' | 'endTsMs' | 'pausedAtMs' | 'pausedTotalMs'>,
  nowMs: number,
): number => {
  if (session.startTsMs === null) return 0
  const end = session.endTsMs ?? nowMs
  const openPause = session.pausedAtMs === null ? 0 : Math.max(0, end - session.pausedAtMs)
  return Math.max(0, end - session.startTsMs - session.pausedTotalMs - openPause)
}
