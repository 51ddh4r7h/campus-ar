/**
 * Hunt state machine + timer.
 *
 * The timer is wall-clock based (`Date.now()`), never `setInterval`-counted,
 * so backgrounding/foregrounding the app (or brief tracking loss) can't reset
 * or drift it. State is persisted to sessionStorage so a mid-hunt reload in the
 * same tab resumes where the user was.
 */

import {FILM_SPOTS, type FilmSpot} from './data/spots'

export type HuntStatus = 'not_started' | 'in_progress' | 'complete'
export type SpotStatus = 'locked' | 'unlocked' | 'found'

export interface SplitEntry {
  spotId: string
  spotName: string
  /** Elapsed since the previous spot (or since hunt start for the first). */
  timeMs: number
}

export interface SpotRun {
  spot: FilmSpot
  status: SpotStatus
  /** Date.now() when revealed, or null. */
  foundAtMs: number | null
  /** Split for display, computed at reveal. */
  splitMs: number | null
}

const STORAGE_KEY = 'campus-film-hunt:v1'

interface PersistedState {
  status: HuntStatus
  startTimeMs: number
  endTimeMs: number | null
  foundAt: Record<string, number>
}

const loadPersisted = (): PersistedState | null => {
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as PersistedState
    if (!parsed.status || typeof parsed.startTimeMs !== 'number') return null
    return parsed
  } catch {
    return null
  }
}

export function createHunt(): HuntController {
  const persisted = loadPersisted()

  const spots: SpotRun[] = FILM_SPOTS.map((spot) => ({
    spot,
    status: 'locked',
    foundAtMs: persisted?.foundAt[spot.id] ?? null,
    splitMs: null,
  }))

  for (const run of spots) {
    if (run.foundAtMs !== null) run.status = 'found'
  }

  let status: HuntStatus = persisted?.status ?? 'not_started'
  let startTimeMs = persisted?.startTimeMs ?? 0
  let endTimeMs = persisted?.endTimeMs ?? null

  // Recompute the split windows from persisted reveal timestamps.
  // (If the pomodoro-style wall clock was restored, splits still derive from it.)
  const ordered = [...spots].filter((s) => s.foundAtMs !== null).sort((a, b) => a.foundAtMs! - b.foundAtMs!)
  let prevTime = startTimeMs || Date.now()
  for (const run of ordered) {
    run.splitMs = run.foundAtMs! - prevTime
    prevTime = run.foundAtMs!
  }

  // If the persisted state says complete, backfill endTime.
  if (status === 'complete' && endTimeMs === null) {
    endTimeMs = startTimeMs
    for (const run of spots) if (run.foundAtMs !== null) endTimeMs = Math.max(endTimeMs, run.foundAtMs!)
  }

  let listeners: Array<() => void> = []

  const persist = (): void => {
    try {
      window.sessionStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({
          status,
          startTimeMs,
          endTimeMs,
          foundAt: Object.fromEntries(spots.filter((s) => s.foundAtMs !== null).map((s) => [s.spot.id, s.foundAtMs!])),
        } satisfies PersistedState),
      )
    } catch {
      /* private browsing etc. — degrade gracefully */
    }
  }

  const emit = (): void => {
    persist()
    for (const listener of listeners) listener()
  }

  const controller: HuntController = {
    get status() {
      return status
    },
    get startTimeMs() {
      return startTimeMs
    },
    get endTimeMs() {
      return endTimeMs
    },
    spots,

    start() {
      if (status !== 'not_started') return
      status = 'in_progress'
      startTimeMs = Date.now()
      endTimeMs = null
      emit()
    },

    elapsedMs() {
      if (status === 'not_started') return 0
      const end = status === 'complete' && endTimeMs !== null ? endTimeMs : Date.now()
      return Math.max(0, end - startTimeMs)
    },

    setUnlocked(spotId: string) {
      const run = spots.find((s) => s.spot.id === spotId)
      if (!run || run.status === 'found') return
      // Only a *locked* spot can become unlocked.
      run.status = 'unlocked'
      emit()
    },

    reveal(spotId: string) {
      const run = spots.find((s) => s.spot.id === spotId)
      if (!run || run.status === 'found') return

      const now = Date.now()
      const prior = [...spots]
        .filter((s) => s.foundAtMs !== null && s.foundAtMs < now)
        .sort((a, b) => a.foundAtMs! - b.foundAtMs!)
      const base = prior.length > 0 ? prior[prior.length - 1].foundAtMs! : startTimeMs || now
      run.foundAtMs = now
      run.splitMs = now - base
      run.status = 'found'

      if (spots.every((s) => s.status === 'found')) {
        status = 'complete'
        endTimeMs = now
      }
      emit()
    },

    allFound() {
      return spots.every((s) => s.status === 'found')
    },

    onChange(cb: () => void) {
      listeners.push(cb)
      return () => {
        listeners = listeners.filter((l) => l !== cb)
      }
    },
  }

  return controller
}

export interface HuntController {
  readonly status: HuntStatus
  readonly startTimeMs: number
  readonly endTimeMs: number | null
  readonly spots: SpotRun[]
  start(): void
  /** Total elapsed ms (running up to now, or frozen at completion). */
  elapsedMs(): number
  setUnlocked(spotId: string): void
  reveal(spotId: string): void
  allFound(): boolean
  onChange(cb: () => void): () => void
}

/** mm:ss (or m:ss.m for sub-minute splits) — the hunt's clock language. */
export const formatClock = (ms: number): string => {
  const totalSeconds = Math.floor(ms / 1000)
  const m = Math.floor(totalSeconds / 60)
  const s = totalSeconds % 60
  const tenths = Math.floor((ms % 1000) / 100)
  if (m === 0) return `${s}.${tenths}`
  return `${m}:${String(s).padStart(2, '0')}`
}

/** mm:ss, zero-padded, used on the marquee/leaderboard. */
export const formatMarquee = (ms: number): string => {
  const totalSeconds = Math.round(ms / 1000)
  const m = Math.floor(totalSeconds / 60)
  const s = totalSeconds % 60
  return `${m}:${String(s).padStart(2, '0')}`
}