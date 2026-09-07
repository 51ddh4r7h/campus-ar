/**
 * Sample data for the dashboard mock.
 *
 * Every number here is invented. It is generated from a seed rather than
 * hand-written so the shapes look like a real morning — a build-up, a peak, a
 * long tail — and so switching cohorts changes the whole board rather than one
 * panel. Nothing in this file reads the database, and nothing in the app reads
 * this file except the dashboard screen.
 *
 * Replace `cohort()` with a real query and the charts do not change.
 */

import {LEVEL_COUNT, LOCATIONS} from '@cmh/shared'

/** Deterministic PRNG (mulberry32) — same seed, same board, every reload. */
function rng(seed: number): () => number {
  let a = seed
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export interface Point {
  /** Minutes from the start of the session. */
  x: number
  y: number
}

export interface Series {
  name: string
  colour: string
  points: Point[]
}

export interface Row {
  label: string
  value: number
  /** Secondary line under the label — a count, a share. */
  sub?: string
  /**
   * Which side of a diverging axis this sits on. Kept separate from `value`
   * because the sign of the value cannot carry it: the middle band is neither
   * side, and encoding that as zero would erase its count.
   */
  side?: 'under' | 'level' | 'over'
}

export interface Cohort {
  id: string
  name: string
  players: number
  onCourse: number
  finished: number
  /** Median finish against par, ms. Negative is under par. */
  medianVsParMs: number
  medianFinishMs: number
  completionRate: number
  activity: Series[]
  funnel: Row[]
  legTimes: Row[]
  vsPar: Row[]
}

const SERIES_ON_COURSE = '#3987e5'
const SERIES_FINISHED = '#d95926'

const minutesLabel = (m: number): string => {
  const start = 9 * 60 + 30 // a 09:30 kickoff, purely for the axis
  const t = start + m
  return `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`
}

export const clockLabel = minutesLabel

/** A rise-and-fall curve: players arrive, play, and drain into "finished". */
function activityCurve(seed: number, players: number, finishedTotal: number): Series[] {
  const r = rng(seed)
  const onCourse: Point[] = []
  const finished: Point[] = []
  let done = 0
  let raw = 0
  const steps: number[] = []
  for (let i = 0; i <= 24; i++) {
    const t = i / 24
    steps.push(t * (0.7 + r() * 0.7))
    raw += steps[i]!
  }
  for (let i = 0; i <= 24; i++) {
    const m = i * 5
    // A smooth hump peaking around a third of the way in, then draining.
    const t = i / 24
    const ramp = Math.min(1, t * 4)
    const decay = Math.exp(-Math.pow((t - 0.32) * 2.4, 2))
    // Nobody is "on course" who never registered.
    const live = Math.min(players, Math.round(players * ramp * decay * (0.86 + r() * 0.2)))
    // The finished line has to land on the number the tile shows, or the
    // dashboard contradicts itself in two places at once.
    done = Math.min(finishedTotal, done + Math.round((steps[i]! / raw) * finishedTotal))
    onCourse.push({x: m, y: live})
    finished.push({x: m, y: done})
  }
  finished[finished.length - 1] = {x: 24 * 5, y: finishedTotal}
  return [
    {name: 'On course', colour: SERIES_ON_COURSE, points: onCourse},
    {name: 'Finished', colour: SERIES_FINISHED, points: finished},
  ]
}

/** How far people got. Monotonically decreasing, by construction. */
function funnel(seed: number, players: number): Row[] {
  const r = rng(seed + 11)
  const rows: Row[] = []
  let n = players
  for (let level = 1; level <= LEVEL_COUNT; level++) {
    if (level > 1) n = Math.round(n * (0.82 + r() * 0.13))
    rows.push({
      label: `Level ${level}`,
      value: n,
      sub: `${Math.round((n / players) * 100)}% of starters`,
    })
  }
  return rows
}

/** Median minutes spent on the leg that ends at each location. */
function legTimes(seed: number): Row[] {
  const r = rng(seed + 29)
  return LOCATIONS.map((l) => {
    const base = 3.2 + l.difficulty * 1.4
    const value = +(base + r() * 2.6).toFixed(1)
    return {label: l.name, value, sub: l.difficulty >= 3 ? 'Marked difficult' : 'Marked easy'}
  }).sort((a, b) => b.value - a.value)
}

/** Finishers bucketed by how far under or over par they came in. */
function vsPar(seed: number, finishers: number): Row[] {
  const r = rng(seed + 47)
  const bands = ['−6 min or better', '−4 min', '−2 min', 'On par', '+2 min', '+4 min', '+6 min or worse']
  const weights = [0.06, 0.13, 0.22, 0.18, 0.19, 0.14, 0.08]
  // Signed so the chart can put "better than par" on one side of zero.
  const sides = ['under', 'under', 'under', 'level', 'over', 'over', 'over'] as const
  return bands.map((label, i) => ({
    label,
    value: Math.max(1, Math.round(finishers * weights[i]! * (0.82 + r() * 0.36))),
    side: sides[i]!,
    sub: sides[i]! === 'under' ? 'Under par' : sides[i]! === 'over' ? 'Over par' : 'Level with par',
  }))
}

function cohort(id: string, name: string, players: number, seed: number): Cohort {
  const r = rng(seed)
  const finished = Math.round(players * (0.62 + r() * 0.2))
  const onCourse = Math.round((players - finished) * (0.35 + r() * 0.3))
  return {
    id,
    name,
    players,
    onCourse,
    finished,
    medianVsParMs: Math.round((-2.4 + r() * 3.6) * 60_000),
    medianFinishMs: Math.round((17 + r() * 7) * 60_000),
    completionRate: finished / players,
    activity: activityCurve(seed, players, finished),
    funnel: funnel(seed, players),
    legTimes: legTimes(seed),
    vsPar: vsPar(seed, finished),
  }
}

export const COHORTS: readonly Cohort[] = [
  cohort('induction-26', 'Induction 2026', 198, 1207),
  cohort('sidtm-a', 'SIDTM — Batch A', 96, 5521),
  cohort('pilot', 'Pilot group', 42, 9034),
]
