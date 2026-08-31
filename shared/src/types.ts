/**
 * Data model (v1) for Campus Movie Hunt.
 *
 * The server is authoritative. The client holds a view of session state and
 * emits position + intent; it never decides that a level is complete.
 */

export type DifficultyTier = 1 | 2 | 3

/** One of the ten campus locations. `id` is a short stable slug. */
export interface GameLocation {
  id: string
  name: string
  lat: number
  lng: number
  /** Geofence radius in metres. Locations sit >60 m apart so radii never overlap. */
  radiusM: number
  difficulty: DifficultyTier
  /** Reward media. `clipUrl` plays at the reveal; poster covers load/failure. */
  clipUrl: string
  posterUrl: string
  /** Still frame used by the "compare the shot" alignment overlay. */
  sceneRefImage: string
  /** The film pairing, revealed only after discovery. Playful fiction for now. */
  movie: {title: string; blurb: string}
  /** Revealed only after discovery. */
  campusFact: string
  /** Progressive clue ladder. `far` is always shown; `warm`/`close` are hints. */
  clue: {
    far: string
    warm: string
    close: string
  }
}

export type BatchStatus = 'draft' | 'open' | 'closed'

export interface Batch {
  id: string
  name: string
  status: BatchStatus
  createdAtMs: number
  /** Seed used to generate this batch's balanced route pool. */
  routePoolSeed: string
  parConstants: ParConstants
}

export interface Player {
  id: string
  batchId: string
  name: string
  /** University roster / student id — the anti-cheat identity anchor. */
  rosterId: string
  sessionToken: string
}

/** A player's assigned path: five location ids in play order, with par split out. */
export interface Route {
  playerId: string
  stops: [string, string, string, string, string]
  parTotalMs: number
  legParMs: [number, number, number, number, number]
}

export type SessionStatus =
  | 'not_started'
  | 'in_progress'
  | 'complete'
  | 'flagged'

export interface Session {
  playerId: string
  status: SessionStatus
  startTsMs: number | null
  endTsMs: number | null
  /** 1-5 while in progress; 6 once complete. */
  currentLevel: number
  /** Hint rungs taken on the current level (0-3). Resets each level. */
  currentLevelHints: number
  /** Accumulated hint penalty across the whole hunt, in ms. */
  penaltyMs: number
  /** elapsed + penalties − par, in ms. Null until complete. Lower is better. */
  scoreMs: number | null
}

export type HintRung = 'warm' | 'close' | 'showLocation'

export interface Split {
  playerId: string
  level: number
  locationId: string
  reachedTsMs: number
  splitMs: number
  hintsUsed: number
  penaltyMs: number
}

export type GameEventType =
  | 'hunt_started'
  | 'clue_served'
  | 'location_reached'
  | 'hint_used'
  | 'hunt_completed'
  | 'skip_attempt'
  | 'speed_flag'
  | 'signal_lost'

export interface GameEvent {
  playerId: string
  type: GameEventType
  tsMs: number
  payload: Readonly<Record<string, string | number | boolean | null>>
}

export interface Breadcrumb {
  playerId: string
  tsMs: number
  lat: number
  lng: number
  accuracyM: number
}

/** A single position sample the client sends for validation. */
export interface GeoSample {
  lat: number
  lng: number
  accuracyM: number
  tsMs: number
  /** True when produced by the demo simulator rather than the device. */
  simulated: boolean
}

export interface ParConstants {
  /** Expected decipher time per difficulty tier, in ms. */
  identifyParMs: Record<DifficultyTier, number>
  /** Flat dwell + fumble allowance per stop, in ms. */
  dwellParMs: number
  /** Assumed walking speed for seeding walk pars, metres per second. */
  walkSpeedMps: number
  /** Time added to a player's elapsed for each hint rung, in ladder order. */
  hintPenaltyMs: Record<HintRung, number>
}

// ---------------------------------------------------------------- API contracts

export interface StartHuntResponse {
  session: Session
  clue: ClueView
}

/** What the client is allowed to know about the current level. Never leaks the answer. */
export interface ClueView {
  level: number
  clipUrl: string
  posterUrl: string
  sceneRefImage: string
  /** Progressive text — only rungs the player has unlocked are populated. */
  clueText: {far: string; warm: string | null; close: string | null}
  radiusHintM: number
  /** Set only once the "show me the location" hint has been taken. */
  revealPoint: {lat: number; lng: number} | null
}

export type ValidationFailure =
  | 'wrong_location'
  | 'level_locked'
  | 'signal'
  | 'dwell'
  | 'too_fast'
  | 'not_in_progress'

/** The reward payload — only sent once the level is validated. */
export interface RevealView {
  level: number
  locationName: string
  movie: {title: string; blurb: string}
  campusFact: string
  clipUrl: string
  posterUrl: string
  splitMs: number
  penaltyMs: number
  /** True once every level is done. */
  huntComplete: boolean
}

export interface ValidationResult {
  ok: boolean
  failure: ValidationFailure | null
  session: Session
  /** Present when a level was just completed. */
  split: Split | null
  /** The reward for the level just completed. */
  reveal: RevealView | null
  /** The next clue, or null when the hunt is complete. */
  nextClue: ClueView | null
}

/** Non-mutating "am I there yet?" probe — never names the location. */
export interface NearbyResult {
  /** True when standing inside the current target's radius with a good fix. */
  atTarget: boolean
  /** Continuous time held inside so far, ms. */
  dwellMs: number
  dwellNeededMs: number
  /** False when only poor-accuracy fixes reach the target. */
  signalOk: boolean
  /** Present when the probe would fail for a reason worth surfacing. */
  failure: ValidationFailure | null
}

export interface StandingRow {
  rank: number
  playerName: string
  isSelf: boolean
  /** `-Xms` under par for finished players; null while still playing. */
  scoreMs: number | null
  /** Current level for players in progress; null once complete. */
  level: number | null
}
