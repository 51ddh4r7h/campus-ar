/**
 * Game constants. One place, no magic numbers scattered through the engine.
 * Values are first drafts — calibrate against a staff walk-through and the
 * first batch's real data (see docs/BUILD-PLAN.md, par model).
 */

import type {ParConstants} from './types'

export const LEVEL_COUNT = 5
/**
 * Locations in play. Ten of the twelve surveyed sites — the other two sit
 * inside a neighbour's geofence and are parked in ./content.
 */
export const LOCATION_POOL_SIZE = 10

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
  hintPenaltyMs: {warm: 90_000, close: 90_000},
  // The screening that opens a level is free and not metered. One more look
  // after that — a replay or a compare — is free too; every one past that costs
  // time, the same way a hint does. The clip is the clue, so staring at it
  // until the answer arrives should not be free.
  freeViews: 1,
  viewPenaltyMs: 45_000,
}

/**
 * Client request cadence.
 *
 * These are a load budget, not preferences. Every one of them is multiplied by
 * the size of the cohort, and we run cohorts of ~200: at that size a five
 * second poll is 40 requests a second before anyone has done anything. Nothing
 * here should be shortened without working out what it costs at 200 players —
 * `__load.test.ts` pins the arithmetic.
 */
export const POLLING = {
  /** "Am I there yet?" — read-only, a handful of indexed rows per call. */
  nearbyMs: 5_000,
  /** Faster while the reveal is being waited on, where latency is felt. */
  nearbyRevealMs: 2_500,
  /**
   * The board. Only runs while it is on screen: it is the one read whose cost
   * grows with the cohort, so polling it in the background cost more than
   * everything else combined.
   */
  standingsMs: 12_000,
  /** Breadcrumb upload. Batched, so this is round trips rather than rows. */
  crumbFlushMs: 15_000,
  /**
   * Minimum gap between recorded breadcrumbs. `watchPosition` fires about once
   * a second; at a walking pace 5s is about 6m, still a legible track for the
   * organisers, at a fifth of the writes. Arrival checks are unaffected — they
   * read the full-rate buffer.
   */
  crumbMinGapMs: 5_000,
} as const

/**
 * How long a player has, once they press START.
 *
 * A hard limit, not a suggestion: the clock counts down on screen, and the
 * server ends the hunt at the deadline whether or not the app is still open.
 * Paused time does not count against it — a player who stops for five minutes
 * still gets their twenty-five.
 *
 * This is also the safety net that used to be a six-hour cap. A session left
 * running can now only ever be twenty-five minutes long, so there is nothing
 * left to run away.
 */
export const HUNT_LIMIT_MS = 25 * 60 * 1000

/**
 * Route-pool generation. Routes are a random draw from every playable one —
 * see ./routes for why, and for what that costs in fairness.
 */
export const ROUTE_POOL = {
  /**
   * How many routes a batch stores: the first N of its random shuffle. Past
   * this many players routes repeat. The pool rides on the batch row, which is
   * read on every request, so this is a load number as much as a game one.
   */
  size: 200,
  /** Level 1 is always this tier or easier. */
  maxFirstLevelDifficulty: 1,
  /** No route may contain more than this many hard (tier 3) clues. */
  maxHardClues: 2,
  /**
   * Nor fewer than this. Without a floor a random draw gives a share of players
   * five Easy scenes and nothing else, and they finish without ever meeting one
   * of the three the organisers marked Difficult.
   */
  minHardClues: 1,
  /**
   * Difficulty may not fall as a route progresses.
   *
   * A player who opens on the hardest clue on campus has no idea yet what the
   * game even feels like, and that is where people give up. So the ramp only
   * ever goes one way: the easy recognitions come first and build the habit,
   * and the marked-Difficult scenes land at the end, on someone who now knows
   * exactly what they are looking for.
   */
  difficultyRamp: true,
  /** A single leg may not exceed this share of the route's total walk distance. */
  maxLegShareOfRoute: 0.42,
} as const
