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
  /** elapsed − par, in ms. Null until complete. Lower is better. */
  scoreMs: number | null
}

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
  /** Time added to a player's elapsed for each hint rung. */
  hintPenaltyMs: {far: number; warm: number; showLocation: number}
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
}

export type ValidationFailure =
  | 'wrong_location'
  | 'level_locked'
  | 'signal'
  | 'dwell'
  | 'too_fast'
  | 'not_in_progress'

export interface ValidationResult {
  ok: boolean
  failure: ValidationFailure | null
  session: Session
  /** Present when a level was just completed. */
  split: Split | null
  /** The next clue, or null when the hunt is complete. */
  nextClue: ClueView | null
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
