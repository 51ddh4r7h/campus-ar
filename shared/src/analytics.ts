/**
 * What a cohort's play actually tells the organisers.
 *
 * The game already writes everything needed: a split per location reached, an
 * event per hint, skip attempt, pause and abandonment, and a session carrying
 * the clock. Nothing here adds instrumentation — it reads what is there and
 * turns it into the handful of numbers a decision hangs on.
 *
 * Pure on purpose. Every figure the dashboard shows is computed here from rows
 * the caller supplies, so it can be tested against a known cohort rather than
 * eyeballed on a chart. The Worker does the fetching; this does the thinking.
 *
 * Two rules run through it. Rates are reported with their denominator, because
 * "80% completion" means something different out of five players than out of
 * two hundred. And a median is used wherever one slow player would drag a mean
 * somewhere misleading — which, on a course where somebody always wanders off,
 * is everywhere.
 */

import {LEVEL_COUNT} from './config'
import {locationById} from './content'
import {SURVEY} from './feedback'
import {elapsedMsOf} from './scoring'
import type {DeviceKind, GameEvent, Player, Route, Session, Split} from './types'

export interface AnalyticsInput {
  players: readonly Player[]
  sessions: readonly Session[]
  routes: readonly Route[]
  splits: readonly Split[]
  events: readonly GameEvent[]
  nowMs: number
}

/** A count with the population it came from, so a rate is never bare. */
export interface Ratio {
  count: number
  of: number
}

export interface FunnelStep {
  label: string
  count: number
  /** Share of the step before it — where people are lost, not where they are. */
  retentionOfPrevious: number
}

export interface LocationStat {
  locationId: string
  name: string
  difficulty: number
  /** Players whose route included this stop. */
  assigned: number
  /** Players who reached it. */
  found: number
  medianSplitMs: number | null
  medianParMs: number | null
  /** Median split as a share of par. Above 1 means the clue plays hard. */
  parIndex: number | null
  hinted: Ratio
  skipAttempts: number
  /** Players whose hunt ended while this stop was the one they were seeking. */
  abandonedHere: number
}

export interface TimeBucket {
  /** Minutes from the first player starting. */
  minute: number
  onCourse: number
  finished: number
}

export interface HintUse {
  rung: string
  count: number
}

export interface AbandonReason {
  reason: string
  count: number
}

/** One row per registered player — the granular view. */
export interface PlayerRow {
  playerId: string
  name: string
  rosterId: string
  device: DeviceKind | 'unknown'
  status: Session['status']
  /** Locations reached, out of five. */
  found: number
  /** Time on the clock, ms. */
  elapsedMs: number
  /** Against par, once finished. Null while playing or if they ran out. */
  scoreMs: number | null
  hintsTaken: number
}

export interface DeviceSplit {
  device: DeviceKind | 'unknown'
  count: number
}

/** How many player-visits a place received. The honest footfall figure. */
export interface LocationVisits {
  locationId: string
  name: string
  visits: number
  /** Players sent there who never arrived. */
  missed: number
}

/** One survey question with a count against each of its answers. */
export interface FeedbackQuestion {
  id: string
  prompt: string
  options: Array<{value: string; label: string; count: number}>
}

/** What the post-game survey came back with, across the cohort. */
export interface FeedbackSummary {
  /** Players who submitted (latest response only, if someone answered twice). */
  responses: number
  /** Mean of the star ratings, 1–5, or null with no responses. */
  avgStars: number | null
  /** Count at each rating: index 0 is one star, index 4 is five. */
  starCounts: [number, number, number, number, number]
  questions: FeedbackQuestion[]
}

export interface Analytics {
  generatedAtMs: number
  registered: number
  started: number
  finished: number
  /** Registered players who ever pressed START. */
  activation: Ratio
  /** Starters who reached all five. */
  completion: Ratio
  /** Finishers who took no hint at all. */
  hintFree: Ratio
  medianScoreMs: number | null
  medianFinishMs: number | null
  /** How long the first location takes — the game's time-to-first-value. */
  medianTimeToFirstFindMs: number | null
  funnel: FunnelStep[]
  locations: LocationStat[]
  timeline: TimeBucket[]
  hints: HintUse[]
  /** Scene replays that cost time, against those that were free. */
  chargedViews: number
  abandonReasons: AbandonReason[]
  /** Arrivals the server judged impossibly fast — GPS spoofing or a bad fix. */
  speedFlags: number
  /** Which phones the cohort played on. */
  devices: DeviceSplit[]
  /** Visits per place, most-visited first. */
  visits: LocationVisits[]
  /** Everyone, one row each. */
  players: PlayerRow[]
  /** The post-game survey. */
  feedback: FeedbackSummary
}

// ------------------------------------------------------------------ helpers

const median = (values: readonly number[]): number | null => {
  if (values.length === 0) return null
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 0 ? Math.round((sorted[mid - 1]! + sorted[mid]!) / 2) : sorted[mid]!
}

const ratio = (count: number, of: number): Ratio => ({count, of})

/**
 * Event payloads, named.
 *
 * `GameEvent.payload` is a bag of JSON because one table carries every kind of
 * event. These guards are the boundary where that bag becomes a domain value:
 * the engine writes `level` on a skip, `rung` on a hint, and so on, and each
 * guard states that contract in one place instead of every reader re-checking
 * it. Anything that fails a guard is left out of the figures rather than
 * silently counted as zero.
 */
type Payload = GameEvent['payload']

const hasLevel = (p: Payload): p is Payload & {level: number} =>
  typeof p['level'] === 'number'

const hasRung = (p: Payload): p is Payload & {rung: string} => typeof p['rung'] === 'string'

const hasReason = (p: Payload): p is Payload & {reason: string} =>
  typeof p['reason'] === 'string'

const hasPenalty = (p: Payload): p is Payload & {penaltyMs: number} =>
  typeof p['penaltyMs'] === 'number'

const hasStars = (p: Payload): p is Payload & {stars: number} =>
  typeof p['stars'] === 'number'

/**
 * Roll the `feedback_submitted` events up into the survey shape.
 *
 * One player can answer more than once (a replay re-shows the screen); the last
 * event wins, matched by keeping only the newest per player id.
 */
function buildFeedback(events: readonly GameEvent[]): FeedbackSummary {
  const latest = new Map<string, GameEvent>()
  for (const e of events) {
    if (e.type !== 'feedback_submitted') continue
    const prev = latest.get(e.playerId)
    if (!prev || e.tsMs >= prev.tsMs) latest.set(e.playerId, e)
  }
  const responses = [...latest.values()]

  const stars = responses
    .map((e) => (hasStars(e.payload) ? Math.round(e.payload.stars) : 0))
    .filter((s) => s >= 1 && s <= 5)
  const starCounts: [number, number, number, number, number] = [
    stars.filter((s) => s === 1).length,
    stars.filter((s) => s === 2).length,
    stars.filter((s) => s === 3).length,
    stars.filter((s) => s === 4).length,
    stars.filter((s) => s === 5).length,
  ]
  const starSum = stars.reduce((a, b) => a + b, 0)

  const questions: FeedbackQuestion[] = SURVEY.map((q) => ({
    id: q.id,
    prompt: q.prompt,
    options: q.options.map((o) => ({
      value: o.value,
      label: o.label,
      count: responses.filter((e) => e.payload[q.id] === o.value).length,
    })),
  }))

  return {
    responses: responses.length,
    avgStars: stars.length > 0 ? Math.round((starSum / stars.length) * 10) / 10 : null,
    starCounts,
    questions,
  }
}

/** Events carry a level; the player's route says which place that level was. */
const stopAt = (route: Route | undefined, event: GameEvent): string | null => {
  if (!route || !hasLevel(event.payload)) return null
  return route.stops[event.payload.level - 1] ?? null
}

/** Tally by key, biggest first — used for hint rungs and abandon reasons. */
function tally(values: readonly string[]): Array<{key: string; count: number}> {
  const counts = new Map<string, number>()
  for (const v of values) counts.set(v, (counts.get(v) ?? 0) + 1)
  return [...counts.entries()]
    .map(([key, count]) => ({key, count}))
    .sort((a, b) => b.count - a.count)
}

// -------------------------------------------------------------- the funnel

/**
 * Registered → started → each level found → finished.
 *
 * Levels are counted from splits rather than from `currentLevel`, so a player
 * who abandoned at level 4 still counts towards the three they did find. The
 * retention figure is against the previous step, which is what names the place
 * people are lost rather than restating the total.
 */
function buildFunnel(
  registered: number,
  started: number,
  splits: readonly Split[],
  finished: number,
): FunnelStep[] {
  const reached = new Map<number, Set<string>>()
  for (const s of splits) {
    const at = reached.get(s.level) ?? new Set<string>()
    at.add(s.playerId)
    reached.set(s.level, at)
  }

  const raw: Array<{label: string; count: number}> = [
    {label: 'Registered', count: registered},
    {label: 'Started', count: started},
  ]
  for (let level = 1; level <= LEVEL_COUNT; level++) {
    raw.push({label: `Found ${level}`, count: reached.get(level)?.size ?? 0})
  }
  raw.push({label: 'Finished', count: finished})

  return raw.map((step, i) => ({
    ...step,
    retentionOfPrevious: i === 0 || raw[i - 1]!.count === 0 ? 1 : step.count / raw[i - 1]!.count,
  }))
}

// ------------------------------------------------------------- per location

interface LocationAccumulator {
  assigned: number
  splits: Split[]
  pars: number[]
  skipAttempts: number
  abandonedHere: number
}

const emptyAccumulator = (): LocationAccumulator => ({
  assigned: 0,
  splits: [],
  pars: [],
  skipAttempts: 0,
  abandonedHere: 0,
})

function accumulateRoutes(
  routes: readonly Route[],
  into: Map<string, LocationAccumulator>,
): void {
  for (const route of routes) {
    route.stops.forEach((id, index) => {
      const acc = into.get(id) ?? emptyAccumulator()
      acc.assigned += 1
      acc.pars.push(route.legParMs[index] ?? 0)
      into.set(id, acc)
    })
  }
}

function accumulateEvents(
  events: readonly GameEvent[],
  routeByPlayer: ReadonlyMap<string, Route>,
  into: Map<string, LocationAccumulator>,
): void {
  for (const e of events) {
    if (e.type !== 'skip_attempt' && e.type !== 'hunt_abandoned') continue
    const id = stopAt(routeByPlayer.get(e.playerId), e)
    if (!id) continue
    const acc = into.get(id) ?? emptyAccumulator()
    if (e.type === 'skip_attempt') acc.skipAttempts += 1
    else acc.abandonedHere += 1
    into.set(id, acc)
  }
}

/**
 * The tuning table: which clue is too hard, and where the walk is too long.
 *
 * `parIndex` is the median split over the median par for the same leg. Above
 * one and the leg is running longer than it was budgeted — either the clue is
 * opaque or the geofence is awkward, and the hint rate beside it tells which.
 */
function buildLocations(
  routes: readonly Route[],
  splits: readonly Split[],
  events: readonly GameEvent[],
): LocationStat[] {
  const byLocation = new Map<string, LocationAccumulator>()
  const routeByPlayer = new Map(routes.map((r) => [r.playerId, r]))

  accumulateRoutes(routes, byLocation)
  for (const s of splits) {
    const acc = byLocation.get(s.locationId) ?? emptyAccumulator()
    acc.splits.push(s)
    byLocation.set(s.locationId, acc)
  }
  accumulateEvents(events, routeByPlayer, byLocation)

  return [...byLocation.entries()]
    .map(([locationId, acc]) => {
      const loc = locationById(locationId)
      const medianSplitMs = median(acc.splits.map((s) => s.splitMs))
      const medianParMs = median(acc.pars)
      return {
        locationId,
        name: loc?.name ?? locationId,
        difficulty: loc?.difficulty ?? 0,
        assigned: acc.assigned,
        found: acc.splits.length,
        medianSplitMs,
        medianParMs,
        parIndex:
          medianSplitMs !== null && medianParMs !== null && medianParMs > 0
            ? medianSplitMs / medianParMs
            : null,
        hinted: ratio(acc.splits.filter((s) => s.hintsUsed > 0).length, acc.splits.length),
        skipAttempts: acc.skipAttempts,
        abandonedHere: acc.abandonedHere,
      }
    })
    .sort((a, b) => (b.parIndex ?? 0) - (a.parIndex ?? 0))
}

// ---------------------------------------------------------------- timeline

/**
 * How many were out walking, five minutes at a time.
 *
 * Built from the sessions rather than from events, because a session knows
 * both ends of its own clock and an event stream has to be replayed to work
 * that out. Minute zero is the first player to start, so the shape is the
 * event's, not the calendar's.
 */
function buildTimeline(sessions: readonly Session[], nowMs: number): TimeBucket[] {
  const running = sessions.filter((s) => s.startTsMs !== null)
  if (running.length === 0) return []

  const first = Math.min(...running.map((s) => s.startTsMs!))
  const last = Math.max(...running.map((s) => s.endTsMs ?? nowMs))
  const span = Math.max(0, last - first)
  const buckets = Math.min(48, Math.max(1, Math.ceil(span / (5 * 60_000))))

  const out: TimeBucket[] = []
  for (let i = 0; i <= buckets; i++) {
    const at = first + i * 5 * 60_000
    out.push({
      minute: i * 5,
      onCourse: running.filter((s) => s.startTsMs! <= at && (s.endTsMs ?? nowMs) > at).length,
      finished: running.filter((s) => s.status === 'complete' && (s.endTsMs ?? nowMs) <= at).length,
    })
  }
  return out
}

/**
 * One row per player, which is the view an organiser actually wants when
 * somebody puts their hand up. Everything here is already on screen somewhere
 * as an aggregate; this is the same data with the averaging taken off.
 */
function buildPlayers(
  players: readonly Player[],
  sessions: readonly Session[],
  splits: readonly Split[],
  nowMs: number,
): PlayerRow[] {
  const sessionOf = new Map(sessions.map((s) => [s.playerId, s]))
  const splitsOf = new Map<string, Split[]>()
  for (const sp of splits) splitsOf.set(sp.playerId, [...(splitsOf.get(sp.playerId) ?? []), sp])

  return players
    .map((p) => {
      const session = sessionOf.get(p.id)
      const mine = splitsOf.get(p.id) ?? []
      return {
        playerId: p.id,
        name: p.name,
        rosterId: p.rosterId,
        device: p.device ?? ('unknown' as const),
        status: session?.status ?? ('not_started' as const),
        found: mine.length,
        elapsedMs: session ? elapsedMsOf(session, nowMs) : 0,
        scoreMs: session?.status === 'complete' ? session.scoreMs : null,
        hintsTaken: mine.reduce((n, sp) => n + sp.hintsUsed, 0),
      }
    })
    .sort((a, b) => b.found - a.found || a.elapsedMs - b.elapsedMs)
}

/**
 * Footfall: how many people actually stood at each place.
 *
 * Not an uplift against a baseline — there is no before to compare with — but
 * a real count of visits to a real location, which is the thing that question
 * is usually reaching for.
 */
function buildVisits(routes: readonly Route[], splits: readonly Split[]): LocationVisits[] {
  const assigned = new Map<string, number>()
  for (const r of routes) for (const id of r.stops) assigned.set(id, (assigned.get(id) ?? 0) + 1)
  const reached = new Map<string, number>()
  for (const s of splits) reached.set(s.locationId, (reached.get(s.locationId) ?? 0) + 1)

  return [...assigned.entries()]
    .map(([locationId, sent]) => {
      const visits = reached.get(locationId) ?? 0
      return {
        locationId,
        name: locationById(locationId)?.name ?? locationId,
        visits,
        missed: Math.max(0, sent - visits),
      }
    })
    .sort((a, b) => b.visits - a.visits)
}

// ------------------------------------------------------------------- public

export function computeAnalytics(input: AnalyticsInput): Analytics {
  const {players, sessions, routes, splits, events, nowMs} = input

  const started = sessions.filter((s) => s.startTsMs !== null)
  const complete = sessions.filter((s) => s.status === 'complete')
  const splitsByPlayer = new Map<string, Split[]>()
  for (const s of splits) {
    splitsByPlayer.set(s.playerId, [...(splitsByPlayer.get(s.playerId) ?? []), s])
  }

  const hintFreeFinishers = complete.filter(
    (s) => (splitsByPlayer.get(s.playerId) ?? []).every((split) => split.hintsUsed === 0),
  )
  const firstFinds = splits.filter((s) => s.level === 1).map((s) => s.splitMs)

  return {
    generatedAtMs: nowMs,
    registered: players.length,
    started: started.length,
    finished: complete.length,
    activation: ratio(started.length, players.length),
    completion: ratio(complete.length, started.length),
    hintFree: ratio(hintFreeFinishers.length, complete.length),
    medianScoreMs: median(complete.map((s) => s.scoreMs ?? 0)),
    medianFinishMs: median(complete.map((s) => elapsedMsOf(s, nowMs))),
    medianTimeToFirstFindMs: median(firstFinds),
    funnel: buildFunnel(players.length, started.length, splits, complete.length),
    locations: buildLocations(routes, splits, events),
    timeline: buildTimeline(sessions, nowMs),
    hints: tally(
      events
        .filter((e) => e.type === 'hint_used')
        .map((e) => (hasRung(e.payload) ? e.payload.rung : 'unknown')),
    ).map(({key, count}) => ({rung: key, count})),
    chargedViews: events.filter(
      (e) => e.type === 'view_charged' && hasPenalty(e.payload) && e.payload.penaltyMs > 0,
    ).length,
    // An abandonment with no reason is the player choosing to stop; the engine
    // only names a reason when something else ended it for them.
    abandonReasons: tally(
      events
        .filter((e) => e.type === 'hunt_abandoned')
        .map((e) => (hasReason(e.payload) ? e.payload.reason : 'player')),
    ).map(({key, count}) => ({reason: key, count})),
    speedFlags: events.filter((e) => e.type === 'speed_flag').length,
    devices: tally(players.map((p) => p.device ?? 'unknown')).map(({key, count}) => ({
      // SAFETY: sourced from Player.device, which is one of the three kinds or
      // null, and null was mapped to 'unknown' above.
      device: key as DeviceKind | 'unknown',
      count,
    })),
    visits: buildVisits(routes, splits),
    players: buildPlayers(players, sessions, splits, nowMs),
    feedback: buildFeedback(events),
  }
}
