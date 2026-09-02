/**
 * Game constants. One place, no magic numbers scattered through the engine.
 * Values are first drafts — calibrate against a staff walk-through and the
 * first batch's real data (see docs/BUILD-PLAN.md, par model).
 */

import type {ParConstants} from './types'

export const LEVEL_COUNT = 5
/**
 * Locations in play. Nine of the twelve surveyed sites — the other three sit
 * inside a neighbour's geofence and are parked in ./content.
 */
export const LOCATION_POOL_SIZE = 9

/** Validation thresholds applied server-side on every arrival check. */
/**
 * Thresholds that do NOT depend on how far apart the stops are. The ones that
 * do — accuracy gate, minimum leg, heat range, geofence radius — are derived
 * from the surveyed coordinates in ./layout, so a compact campus retunes itself.
 */
export const VALIDATION = {
  /** Continuous time inside the radius (with good fixes) before a level validates. */
  dwellMs: 20_000,
  /** Fixes older than this are ignored as stale — must exceed dwellMs. */
  maxFixAgeMs: 25_000,
  /**
   * Fastest believable travel between two stop centres, metres per second.
   * ~2.8 m/s ≈ a brisk jog; anything faster between two completions is flagged.
   */
  maxTravelSpeedMps: 2.8,
} as const

export const DEFAULT_PAR_CONSTANTS: ParConstants = {
  // Generous first drafts — a new joiner unfamiliar with campus, not an expert.
  // Recalibrate from real median leg times after the first batch.
  identifyParMs: {1: 75_000, 2: 135_000, 3: 210_000},
  dwellParMs: 25_000,
  walkSpeedMps: 1.3,
  hintPenaltyMs: {warm: 90_000, close: 90_000, showLocation: 300_000},
  // Two viewings is enough to recognise a place you know; a third is a search
  // aid, and search aids cost time here the same way hints do.
  freeViews: 2,
  viewPenaltyMs: 45_000,
}

/** How long a player must be stuck on a level before each hint rung unlocks. */
export const HINT_GATES = {
  warmAfterMs: 4 * 60_000,
  closeAfterMs: 8 * 60_000,
  showLocationAfterMs: 12 * 60_000,
} as const

/** Route-pool generation constraints. */
export const ROUTE_POOL = {
  size: 200,
  /** Total walk-time spread allowed across the pool, ms. */
  walkTimeBandMs: 90_000,
  /** Max difference in summed difficulty between any two routes. */
  difficultySpread: 1,
  /** Level 1 is always this tier or easier. */
  maxFirstLevelDifficulty: 1,
  /** No route may contain more than this many hard (tier 3) clues. */
  maxHardClues: 2,
  /** A single leg may not exceed this share of the route's total walk distance. */
  maxLegShareOfRoute: 0.42,
} as const
