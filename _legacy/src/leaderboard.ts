/**
 * Leaderboard — STUBBED.
 *
 * The whole leaderboard for this MVP is this file. `submitScore` is the only
 * function the app calls; swapping in a real backend later means rewriting the
 * body of `submitScore` / `fetchLeaderboard` — nothing else.
 *
 * Currently: logs the score, appends it to an in-memory list, and mirrors the
 * list to localStorage so the marquee survives reloads.
 */

import type {SplitEntry} from './hunt'

export interface ScoreEntry {
  name: string
  totalTimeMs: number
  splits: SplitEntry[]
  timestamp: number
}

const STORAGE_KEY = 'campus-film-hunt:leaderboard'

const MOCK_SCORES: ScoreEntry[] = [
  {name: 'Marla', totalTimeMs: 4 * 60000 + 42000, splits: [], timestamp: Date.now() - 86400000 * 3},
  {name: 'Curtis', totalTimeMs: 5 * 60000 + 5000, splits: [], timestamp: Date.now() - 86400000 * 2},
  {name: 'Sofia', totalTimeMs: 6 * 60000 + 16000, splits: [], timestamp: Date.now() - 86400000},
]

/** True when the decoded value carries the full marquee-entry contract. */
const isScoreEntry = (value: Partial<ScoreEntry> | null | undefined): value is ScoreEntry =>
  value !== null &&
  value !== undefined &&
  typeof value.name === 'string' &&
  typeof value.totalTimeMs === 'number' &&
  typeof value.timestamp === 'number' &&
  Array.isArray(value.splits)

const isScoreEntryList = (value: Partial<ScoreEntry>[] | null | undefined): value is ScoreEntry[] =>
  Array.isArray(value) && value.every(isScoreEntry)

const load = (): ScoreEntry[] => {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    const parsed = raw ? JSON.parse(raw) : []
    const stored = isScoreEntryList(parsed) ? parsed : []
    return [...MOCK_SCORES, ...stored].sort((a, b) => a.totalTimeMs - b.totalTimeMs)
  } catch {
    return [...MOCK_SCORES]
  }
}

let CACHE: ScoreEntry[] = load()

/** Current marquee, sorted fastest-first. Dummy data + your real submissions. */
export const fetchLeaderboard = (): ScoreEntry[] => CACHE

/**
 * THE backend stub. Replace this function's body with a real API call later
 * (POST /scores). Signature is the contract — keep it.
 */
export const submitScore = (name: string, totalTimeMs: number, splits: SplitEntry[]): Promise<void> => {
  const entry: ScoreEntry = {name, totalTimeMs, splits, timestamp: Date.now()}
  // eslint-disable-next-line no-console
  console.log('[leaderboard:stub] submitScore →', JSON.stringify(entry, null, 2))

  CACHE = [...CACHE, entry].sort((a, b) => a.totalTimeMs - b.totalTimeMs)
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(CACHE.filter((c) => !MOCK_SCORES.includes(c))))
  } catch {
    /* storage unavailable — in-memory only */
  }

  // An actual backend would return a Promise that resolves once the POST lands.
  return Promise.resolve()
}