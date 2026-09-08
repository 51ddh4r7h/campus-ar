import {beforeEach, describe, expect, it} from 'vitest'
import {computeAnalytics} from './analytics'
import type {GameEvent, Player, Route, Session, Split} from './types'

/**
 * A small cohort with a known shape, so every figure can be checked by hand.
 *
 * Six registered. One never starts. One is still walking. One quit at level 3.
 * Three finished, one of them without a single hint. The numbers below are
 * counted off that sentence, not read off a chart.
 */
const T0 = Date.parse('2026-09-08T09:30:00Z')
const MIN = 60_000

const player = (id: string): Player => ({
  id,
  batchId: 'b1',
  name: id,
  rosterId: id,
  sessionToken: `tok-${id}`,
  passwordHash: null,
  device: null,
})

const route = (playerId: string, stops: string[]): Route => ({
  playerId,
  stops: stops as Route['stops'],
  parTotalMs: 25 * MIN,
  legParMs: [5 * MIN, 5 * MIN, 5 * MIN, 5 * MIN, 5 * MIN],
})

const session = (playerId: string, over: Partial<Session>): Session => ({
  playerId,
  status: 'not_started',
  startTsMs: null,
  endTsMs: null,
  currentLevel: 1,
  currentLevelHints: 0,
  currentLevelViews: 0,
  hintCreditUsed: false,
  penaltyMs: 0,
  scoreMs: null,
  pausedAtMs: null,
  pausedTotalMs: 0,
  ...over,
})

const split = (playerId: string, level: number, locationId: string, splitMs: number, hints = 0): Split => ({
  playerId,
  level,
  locationId,
  reachedTsMs: T0 + level * splitMs,
  splitMs,
  hintsUsed: hints,
  penaltyMs: 0,
})

const STOPS = ['amphitheatre', 'symbieat', 'sibm', 'library', 'fountain']

let input: Parameters<typeof computeAnalytics>[0]

beforeEach(() => {
  const players = ['never', 'walking', 'quit', 'fast', 'mid', 'slow'].map(player)
  const routes = players.map((p) => route(p.id, STOPS))

  const sessions: Session[] = [
    session('never', {}),
    session('walking', {status: 'in_progress', startTsMs: T0, currentLevel: 3}),
    session('quit', {status: 'abandoned', startTsMs: T0, endTsMs: T0 + 20 * MIN, currentLevel: 3}),
    session('fast', {status: 'complete', startTsMs: T0, endTsMs: T0 + 20 * MIN, currentLevel: 6, scoreMs: -5 * MIN}),
    session('mid', {status: 'complete', startTsMs: T0, endTsMs: T0 + 25 * MIN, currentLevel: 6, scoreMs: 0}),
    session('slow', {status: 'complete', startTsMs: T0, endTsMs: T0 + 31 * MIN, currentLevel: 6, scoreMs: 6 * MIN}),
  ]

  const splits: Split[] = [
    // Still walking: found two.
    split('walking', 1, STOPS[0]!, 4 * MIN),
    split('walking', 2, STOPS[1]!, 6 * MIN),
    // Quit after two.
    split('quit', 1, STOPS[0]!, 5 * MIN),
    split('quit', 2, STOPS[1]!, 9 * MIN, 1),
    // Three finishers. `fast` took no hints at all.
    ...STOPS.flatMap((id, i) => [
      split('fast', i + 1, id, 4 * MIN),
      split('mid', i + 1, id, 5 * MIN, i === 2 ? 1 : 0),
      split('slow', i + 1, id, 6 * MIN, i === 2 ? 2 : 0),
    ]),
  ]

  const events: GameEvent[] = [
    {playerId: 'quit', type: 'hunt_abandoned', tsMs: T0 + 20 * MIN, payload: {level: 3}},
    {playerId: 'mid', type: 'hint_used', tsMs: T0, payload: {level: 3, rung: 'warm'}},
    {playerId: 'slow', type: 'hint_used', tsMs: T0, payload: {level: 3, rung: 'warm'}},
    {playerId: 'slow', type: 'hint_used', tsMs: T0, payload: {level: 3, rung: 'close'}},
    {playerId: 'slow', type: 'skip_attempt', tsMs: T0, payload: {level: 3}},
    {playerId: 'walking', type: 'skip_attempt', tsMs: T0, payload: {level: 3}},
    {playerId: 'slow', type: 'view_charged', tsMs: T0, payload: {level: 2, penaltyMs: 30_000}},
    {playerId: 'mid', type: 'view_charged', tsMs: T0, payload: {level: 2, penaltyMs: 0}},
    {playerId: 'walking', type: 'speed_flag', tsMs: T0, payload: {level: 1}},
  ]

  input = {players, sessions, routes, splits, events, nowMs: T0 + 40 * MIN}
})

describe('analytics — headline figures', () => {
  it('counts activation and completion against the right denominators', () => {
    const a = computeAnalytics(input)
    expect(a.registered).toBe(6)
    expect(a.started).toBe(5) // everyone but `never`
    expect(a.finished).toBe(3)
    // A rate is never bare: the denominator travels with it.
    expect(a.activation).toEqual({count: 5, of: 6})
    expect(a.completion).toEqual({count: 3, of: 5})
  })

  it('counts a hint-free finish only when no level took one', () => {
    const a = computeAnalytics(input)
    // `fast` took none; `mid` and `slow` each took at least one on level 3.
    expect(a.hintFree).toEqual({count: 1, of: 3})
  })

  it('takes medians, so one slow player cannot move the headline', () => {
    const a = computeAnalytics(input)
    expect(a.medianScoreMs).toBe(0) // −5, 0, +6 → 0
    expect(a.medianFinishMs).toBe(25 * MIN) // 20, 25, 31 → 25
    // Time to first find: 4, 5, 4, 5, 6 → 5
    expect(a.medianTimeToFirstFindMs).toBe(5 * MIN)
  })
})

describe('analytics — funnel', () => {
  it('counts a level from the splits, so a quitter still counts what they found', () => {
    const a = computeAnalytics(input)
    const by = Object.fromEntries(a.funnel.map((f) => [f.label, f.count]))
    expect(by['Registered']).toBe(6)
    expect(by['Started']).toBe(5)
    // walking, quit, fast, mid, slow all found level 1.
    expect(by['Found 1']).toBe(5)
    expect(by['Found 2']).toBe(5)
    // walking and quit both stop before three.
    expect(by['Found 3']).toBe(3)
    expect(by['Found 5']).toBe(3)
    expect(by['Finished']).toBe(3)
  })

  it('reports retention against the step before, not the total', () => {
    const a = computeAnalytics(input)
    const found3 = a.funnel.find((f) => f.label === 'Found 3')!
    // 3 of the 5 who found level 2 — the drop happens here, and this names it.
    expect(found3.retentionOfPrevious).toBeCloseTo(3 / 5)
  })
})

describe('analytics — the tuning table', () => {
  it('indexes each leg against its own par', () => {
    const a = computeAnalytics(input)
    const sibm = a.locations.find((l) => l.locationId === 'sibm')!
    // Level 3 splits: 5 (mid), 6 (slow), 4 (fast) → median 5 against a 5 par.
    expect(sibm.medianSplitMs).toBe(5 * MIN)
    expect(sibm.medianParMs).toBe(5 * MIN)
    expect(sibm.parIndex).toBeCloseTo(1)
  })

  it('attributes hints, skips and abandonment to the place they happened', () => {
    const a = computeAnalytics(input)
    const sibm = a.locations.find((l) => l.locationId === 'sibm')!
    // mid and slow both took a hint on level 3; fast did not.
    expect(sibm.hinted).toEqual({count: 2, of: 3})
    // Both skip attempts were on level 3, which is sibm on this route.
    expect(sibm.skipAttempts).toBe(2)
    // `quit` gave up while level 3 was the one they were looking for.
    expect(sibm.abandonedHere).toBe(1)
  })

  it('separates who was sent somewhere from who got there', () => {
    const a = computeAnalytics(input)
    const fountain = a.locations.find((l) => l.locationId === 'fountain')!
    expect(fountain.assigned).toBe(6) // every route ends there
    expect(fountain.found).toBe(3) // only the three finishers
  })

  it('puts the leg running furthest over par first', () => {
    const a = computeAnalytics(input)
    expect(a.locations[0]!.parIndex).toBeGreaterThanOrEqual(a.locations[1]!.parIndex ?? 0)
  })
})

describe('analytics — behaviour counts', () => {
  it('reads hint rungs and abandon reasons out of the event payloads', () => {
    const a = computeAnalytics(input)
    expect(a.hints).toEqual([
      {rung: 'warm', count: 2},
      {rung: 'close', count: 1},
    ])
    // No reason recorded means the player chose to stop.
    expect(a.abandonReasons).toEqual([{reason: 'player', count: 1}])
  })

  it('counts only the views that actually cost time', () => {
    const a = computeAnalytics(input)
    expect(a.chargedViews).toBe(1)
  })

  it('surfaces arrivals the server thought impossible', () => {
    expect(computeAnalytics(input).speedFlags).toBe(1)
  })
})

describe('analytics — the granular view', () => {
  it('gives one row per player, furthest first', () => {
    const a = computeAnalytics(input)
    expect(a.players).toHaveLength(6)
    expect(a.players[0]!.found).toBeGreaterThanOrEqual(a.players.at(-1)!.found)
    const never = a.players.find((p) => p.name === 'never')!
    expect(never.status).toBe('not_started')
    expect(never.found).toBe(0)
    expect(never.elapsedMs).toBe(0)
    // Hints are counted per person, not just in the cohort total.
    expect(a.players.find((p) => p.name === 'slow')!.hintsTaken).toBe(2)
  })

  it('reports the device split, with unknown for anyone who never said', () => {
    const withPhones = {
      ...input,
      players: input.players.map((p, i) => ({
        ...p,
        device: (i < 3 ? 'android' : i < 5 ? 'ios' : null) as 'android' | 'ios' | null,
      })),
    }
    const a = computeAnalytics(withPhones)
    expect(a.devices).toEqual([
      {device: 'android', count: 3},
      {device: 'ios', count: 2},
      {device: 'unknown', count: 1},
    ])
  })

  it('counts visits to a place, and the people sent who never arrived', () => {
    const a = computeAnalytics(input)
    const first = a.visits.find((v) => v.locationId === STOPS[0])!
    // Everyone was routed through it; five of the six reached it.
    expect(first.visits).toBe(5)
    expect(first.missed).toBe(1)
    // Ordered by how busy the place was.
    expect(a.visits[0]!.visits).toBeGreaterThanOrEqual(a.visits.at(-1)!.visits)
  })
})

describe('analytics — timeline', () => {
  it('runs from the first start and counts who is out at each point', () => {
    const a = computeAnalytics(input)
    expect(a.timeline[0]!.minute).toBe(0)
    expect(a.timeline[0]!.onCourse).toBe(5)
    // By minute 25 only `walking` is still going, and two have finished.
    const at25 = a.timeline.find((b) => b.minute === 25)!
    expect(at25.onCourse).toBe(2) // walking + slow (finishes at 31)
    expect(at25.finished).toBe(2) // fast at 20, mid at 25
  })

  it('is empty before anyone starts', () => {
    const a = computeAnalytics({
      ...input,
      sessions: input.sessions.map((s) => ({...s, startTsMs: null, endTsMs: null})),
    })
    expect(a.timeline).toEqual([])
  })
})

describe('analytics — an empty cohort', () => {
  it('reports zeroes and nulls rather than dividing by nothing', () => {
    const a = computeAnalytics({players: [], sessions: [], routes: [], splits: [], events: [], nowMs: T0})
    expect(a.registered).toBe(0)
    expect(a.activation).toEqual({count: 0, of: 0})
    expect(a.medianScoreMs).toBeNull()
    expect(a.locations).toEqual([])
    expect(a.timeline).toEqual([])
  })
})
