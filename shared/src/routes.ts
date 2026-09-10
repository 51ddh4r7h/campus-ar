/**
 * Route-pool generation: a random draw from every playable route.
 *
 * Every player plays 5 of the 10 locations in a personal order. We enumerate
 * every 5-permutation, keep the ones that pass the playability rules below,
 * shuffle all of them with the batch's random seed, and hand them out in that
 * order — so each player gets a route drawn at random from the whole playable
 * set, and no two players get the same one.
 *
 * This used to be a *balanced* pool: out of the playable routes it kept only
 * the 200 whose par times sat closest together, which held route luck to about
 * 14 seconds. The organisers chose variety instead — with ten locations that
 * window only ever reached 80 distinct combinations of places. The trade is
 * stated plainly so nobody rediscovers it: routes now range from about 14 to 22
 * minutes of par, and since the podium is decided on raw time, part of any
 * finishing order is the luck of the draw.
 *
 * The playability rules stay, because they are not about fairness between
 * players — they are what stops any one route being a bad game: it opens on an
 * Easy scene, difficulty only climbs, there are one or two Difficult scenes,
 * and no single leg is a cross-campus slog.
 *
 * Only the first `ROUTE_POOL.size` of the shuffle is stored, because the pool
 * rides on the batch row and that row is read on every authenticated request.
 * That is not a smaller lottery: the first N of a uniformly random shuffle is a
 * uniformly random N, in uniformly random order, so handing them out in turn is
 * the same as drawing each player at random from all of them.
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
  /** True when there were fewer playable routes than the pool wanted. */
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

/** True when no leg asks for a harder recognition than the one before it. */
const ramps = (perm: readonly GameLocation[]): boolean => {
  for (let i = 1; i < perm.length; i++) {
    if (perm[i]!.difficulty < perm[i - 1]!.difficulty) return false
  }
  return true
}

/**
 * The ordering rules, before any walking is costed.
 *
 * A player who opens on the hardest clue on campus has no idea yet what the
 * game feels like, and that is where people give up — so difficulty only ever
 * climbs. The floor on hard clues matters just as much: without it a random
 * draw hands a share of players five Easy scenes and nothing else, and the
 * three the organisers marked Difficult go unplayed by them.
 */
export const playableOrder = (perm: readonly GameLocation[]): boolean => {
  if (perm[0]!.difficulty > ROUTE_POOL.maxFirstLevelDifficulty) return false
  const hard = perm.filter((l) => l.difficulty === 3).length
  if (hard > ROUTE_POOL.maxHardClues || hard < ROUTE_POOL.minHardClues) return false
  return !ROUTE_POOL.difficultyRamp || ramps(perm)
}

function buildCandidates(
  locations: readonly GameLocation[],
  startPoint: LatLng,
  pc: ParConstants,
): Candidate[] {
  const out: Candidate[] = []
  for (const perm of permutations(locations, LEVEL_COUNT)) {
    if (!playableOrder(perm)) continue

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

export const generateRoutePool = (
  locations: readonly GameLocation[],
  startPoint: LatLng,
  pc: ParConstants,
  seed: string,
): RoutePool => {
  const rng = mulberry32(seedFromString(seed))
  const candidates = buildCandidates(locations, startPoint, pc)
  const drawn = shuffled(candidates, rng).slice(0, ROUTE_POOL.size)

  const pars = drawn.map((c) => c.parTotalMs)
  const routes = drawn.map(
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
    // Only true now when content is too thin to fill the pool at all.
    relaxed: routes.length < ROUTE_POOL.size,
    stats: {
      candidates: candidates.length,
      difficultySums: [...new Set(drawn.map((c) => c.difficultySum))].sort((a, b) => a - b),
      // Kept under its old name for the admin response; it is the par spread
      // of what was drawn, and with a random draw it is minutes, not seconds.
      walkSpreadMs: pars.length > 0 ? Math.max(...pars) - Math.min(...pars) : 0,
    },
  }
}

const overlapWith = (avoid: ReadonlySet<string>) => (r: RouteTemplate): number =>
  r.stops.reduce((n, id) => n + (avoid.has(id) ? 1 : 0), 0)

/**
 * Pick the next route for a player: the first pool route not already assigned.
 * When the pool is exhausted (more players than routes) it wraps, so late
 * players still get a balanced route — just not a unique one.
 *
 * `avoid` names stops the player has already walked, and is what stops a
 * second run being a re-walk of the first. It cannot promise a clean sheet:
 * five stops drawn twice from nine locations must share at least one, so the
 * best available is one repeat, and this takes the least-overlapping route the
 * pool offers rather than pretending otherwise.
 */
export const assignRoute = (
  pool: RoutePool,
  assignedKeys: ReadonlySet<string>,
  avoid: readonly string[] = [],
): RouteTemplate => {
  if (pool.routes.length === 0) throw new Error('assignRoute: empty pool')
  const free = pool.routes.filter((r) => !assignedKeys.has(key(r.stops)))
  if (avoid.length === 0) {
    return free[0] ?? pool.routes[assignedKeys.size % pool.routes.length]!
  }
  // A repeat route is worse than a shared one: prefer unassigned, but never at
  // the cost of sending someone round the same five places again.
  const overlap = overlapWith(new Set(avoid))
  const from = free.length > 0 ? free : pool.routes
  return from.reduce((best, r) => (overlap(r) < overlap(best) ? r : best), from[0]!)
}

export const routeKey = key
