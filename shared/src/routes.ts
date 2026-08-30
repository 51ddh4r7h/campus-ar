/**
 * Balanced route-pool generation.
 *
 * Every player plays 5 of the 10 locations in a personal order. A pure random
 * draw is unfair for a timed race — walking distance and clue difficulty vary
 * too much. So we enumerate every valid 5-permutation, keep only those that
 * pass the structural constraints, then select a pool whose members are tightly
 * banded on both walking time and total difficulty. Assignment hands each
 * player a distinct route from that pool.
 */

import type {LatLng} from './geo'
import {LEVEL_COUNT, ROUTE_POOL} from './config'
import type {GameLocation, ParConstants} from './types'
import {routePar} from './scoring'
import {mulberry32, seedFromString, shuffled} from './rng'

export interface RouteTemplate {
  stops: [string, string, string, string, string]
  parTotalMs: number
  legParMs: [number, number, number, number, number]
  walkOnlyMs: number
  difficultySum: number
}

export interface RoutePool {
  seed: string
  routes: RouteTemplate[]
  /** True when the constraints had to be relaxed to fill the pool. */
  relaxed: boolean
  /** Diagnostics for the operator reviewing a batch. */
  stats: {
    candidates: number
    difficultySums: number[]
    walkSpreadMs: number
  }
}

const key = (stops: readonly string[]): string => stops.join('>')

/** All ordered 5-tuples of distinct locations. C(10,5)·5! = 30 240. */
function* permutations(
  items: readonly GameLocation[],
  pick: number,
  chosen: GameLocation[] = [],
): Generator<GameLocation[]> {
  if (chosen.length === pick) {
    yield chosen.slice()
    return
  }
  for (const item of items) {
    if (chosen.includes(item)) continue
    chosen.push(item)
    yield* permutations(items, pick, chosen)
    chosen.pop()
  }
}

interface Candidate extends RouteTemplate {
  resolved: GameLocation[]
}

function buildCandidates(
  locations: readonly GameLocation[],
  startPoint: LatLng,
  pc: ParConstants,
): Candidate[] {
  const out: Candidate[] = []
  for (const perm of permutations(locations, LEVEL_COUNT)) {
    const first = perm[0]!
    if (first.difficulty > ROUTE_POOL.maxFirstLevelDifficulty) continue
    if (perm.filter((l) => l.difficulty === 3).length > ROUTE_POOL.maxHardClues) continue

    const par = routePar(perm, startPoint, pc)

    // Reject a route dominated by one brutal leg.
    const walkLegs = par.legMs.map(
      (ms, i) => ms - pc.identifyParMs[perm[i]!.difficulty] - pc.dwellParMs,
    )
    const totalWalk = walkLegs.reduce((a, b) => a + b, 0)
    if (totalWalk > 0 && Math.max(...walkLegs) / totalWalk > ROUTE_POOL.maxLegShareOfRoute) {
      continue
    }

    // SAFETY: `permutations(locations, LEVEL_COUNT)` only yields arrays of
    // length LEVEL_COUNT (5), so `perm` and this mapped array are 5-tuples.
    const stops = perm.map((l) => l.id) as [string, string, string, string, string]
    out.push({
      stops,
      parTotalMs: par.totalMs,
      legParMs: par.legMs,
      walkOnlyMs: par.walkOnlyMs,
      difficultySum: perm.reduce((a, l) => a + l.difficulty, 0),
      resolved: perm,
    })
  }
  return out
}

/** Tightest window of `size` consecutive routes when sorted by par. */
function tightestWindow(sortedByPar: Candidate[], size: number): Candidate[] {
  if (sortedByPar.length <= size) return sortedByPar
  let bestStart = 0
  let bestSpan = Number.POSITIVE_INFINITY
  for (let i = 0; i + size <= sortedByPar.length; i++) {
    const span = sortedByPar[i + size - 1]!.parTotalMs - sortedByPar[i]!.parTotalMs
    if (span < bestSpan) {
      bestSpan = span
      bestStart = i
    }
  }
  return sortedByPar.slice(bestStart, bestStart + size)
}

export const generateRoutePool = (
  locations: readonly GameLocation[],
  startPoint: LatLng,
  pc: ParConstants,
  seed: string,
): RoutePool => {
  const rng = mulberry32(seedFromString(seed))
  const candidates = buildCandidates(locations, startPoint, pc)

  // Group by total difficulty; anchor on the pair of adjacent sums with the
  // most candidates (spread of 1 is allowed between any two routes).
  const bySum = new Map<number, Candidate[]>()
  for (const c of candidates) {
    const bucket = bySum.get(c.difficultySum) ?? []
    bucket.push(c)
    bySum.set(c.difficultySum, bucket)
  }
  const sums = [...bySum.keys()].sort((a, b) => a - b)
  let anchor = sums[0] ?? 0
  let anchorCount = 0
  for (const s of sums) {
    const count = (bySum.get(s)?.length ?? 0) + (bySum.get(s + 1)?.length ?? 0)
    if (count > anchorCount) {
      anchorCount = count
      anchor = s
    }
  }
  const allowedSums = new Set(
    ROUTE_POOL.difficultySpread >= 1 ? [anchor, anchor + 1] : [anchor],
  )
  const balanced = candidates
    .filter((c) => allowedSums.has(c.difficultySum))
    .sort((a, b) => a.parTotalMs - b.parTotalMs)

  const window = tightestWindow(balanced, ROUTE_POOL.size)
  const walkSpreadMs =
    window.length > 0
      ? window[window.length - 1]!.parTotalMs - window[0]!.parTotalMs
      : 0
  const relaxed = window.length < ROUTE_POOL.size || walkSpreadMs > ROUTE_POOL.walkTimeBandMs

  const routes = shuffled(window, rng).map(
    ({stops, parTotalMs, legParMs, walkOnlyMs, difficultySum}): RouteTemplate => ({
      stops,
      parTotalMs,
      legParMs,
      walkOnlyMs,
      difficultySum,
    }),
  )

  return {
    seed,
    routes,
    relaxed,
    stats: {
      candidates: candidates.length,
      difficultySums: [...allowedSums].sort((a, b) => a - b),
      walkSpreadMs,
    },
  }
}

/**
 * Pick the next route for a player: the first pool route not already assigned.
 * When the pool is exhausted (more players than routes) it wraps, so late
 * players still get a balanced route — just not a unique one.
 */
export const assignRoute = (
  pool: RoutePool,
  assignedKeys: ReadonlySet<string>,
): RouteTemplate => {
  if (pool.routes.length === 0) throw new Error('assignRoute: empty pool')
  const free = pool.routes.find((r) => !assignedKeys.has(key(r.stops)))
  return free ?? pool.routes[assignedKeys.size % pool.routes.length]!
}

export const routeKey = key
