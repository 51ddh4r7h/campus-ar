import {describe, expect, it} from 'vitest'
import {DEFAULT_PAR_CONSTANTS, LOCATIONS, START_POINT, locationById} from './index'
import {ROUTE_POOL} from './config'
import {assignRoute, generateRoutePool, routeKey} from './routes'

const pool = generateRoutePool(LOCATIONS, START_POINT, DEFAULT_PAR_CONSTANTS, 'batch-a')

describe('route pool generation', () => {
  it('fills the pool', () => {
    expect(pool.routes.length).toBe(ROUTE_POOL.size)
  })

  it('every route is five distinct real locations', () => {
    for (const r of pool.routes) {
      expect(new Set(r.stops).size).toBe(5)
      for (const id of r.stops) expect(locationById(id)).toBeDefined()
    }
  })

  it('level 1 is always an easy clue', () => {
    for (const r of pool.routes) {
      expect(locationById(r.stops[0])!.difficulty).toBeLessThanOrEqual(
        ROUTE_POOL.maxFirstLevelDifficulty,
      )
    }
  })

  it('no route has more than the hard-clue cap', () => {
    for (const r of pool.routes) {
      const hard = r.stops.filter((id) => locationById(id)!.difficulty === 3).length
      expect(hard).toBeLessThanOrEqual(ROUTE_POOL.maxHardClues)
    }
  })

  it('is a random draw, not a balanced window', () => {
    // The old pool kept only the tightest par band, which meant every route
    // carried the same number of Difficult scenes. A draw from the whole
    // playable set carries both — that is most of the variety it buys.
    const hardCounts = new Set(
      pool.routes.map((r) => r.stops.filter((id) => locationById(id)!.difficulty === 3).length),
    )
    expect(hardCounts).toEqual(new Set([1, 2]))
    // And par spreads over minutes, where the balanced window held ~14 seconds.
    const pars = pool.routes.map((r) => r.parTotalMs)
    expect(Math.max(...pars) - Math.min(...pars)).toBeGreaterThan(3 * 60_000)
    expect(pool.relaxed).toBe(false)
  })

  it('draws from every playable route, not a subset of them', () => {
    // Two batches should overlap about as much as two random 200-samples from
    // the full playable set would — not share one fixed window.
    const other = generateRoutePool(LOCATIONS, START_POINT, DEFAULT_PAR_CONSTANTS, 'batch-z')
    const mine = new Set(pool.routes.map((r) => routeKey(r.stops)))
    const shared = other.routes.filter((r) => mine.has(routeKey(r.stops))).length
    // Expected overlap is 200 * 200 / candidates, about 12 of 3,258; a balanced
    // window would share nearly all 200.
    expect(shared).toBeLessThan(50)
    expect(pool.stats.candidates).toBeGreaterThan(ROUTE_POOL.size * 5)
  })

  it('covers far more combinations of places than the balanced window did', () => {
    const sets = new Set(pool.routes.map((r) => [...r.stops].sort().join('+')))
    // The balanced window reached 80 distinct sets with ten locations.
    expect(sets.size).toBeGreaterThan(120)
  })

  it('is deterministic for a seed and varies across seeds', () => {
    const again = generateRoutePool(LOCATIONS, START_POINT, DEFAULT_PAR_CONSTANTS, 'batch-a')
    expect(again.routes.map((r) => routeKey(r.stops))).toEqual(
      pool.routes.map((r) => routeKey(r.stops)),
    )
    const other = generateRoutePool(LOCATIONS, START_POINT, DEFAULT_PAR_CONSTANTS, 'batch-b')
    expect(other.routes.map((r) => routeKey(r.stops))).not.toEqual(
      pool.routes.map((r) => routeKey(r.stops)),
    )
  })
})

describe('difficulty ramp', () => {
  const tiers = (stops: readonly string[]) => stops.map((id) => locationById(id)!.difficulty)

  it('never asks for a harder recognition than the one before', () => {
    for (const r of pool.routes) {
      const d = tiers(r.stops)
      for (let i = 1; i < d.length; i++) {
        expect(d[i]!, `route ${r.stops.join('>')} falls at level ${i + 1}`).toBeGreaterThanOrEqual(d[i - 1]!)
      }
    }
  })

  it('puts every marked-Difficult scene at the end of its route', () => {
    for (const r of pool.routes) {
      const d = tiers(r.stops)
      const firstHard = d.indexOf(3)
      if (firstHard === -1) continue
      // Once it goes hard it stays hard — so the hard ones are a tail.
      expect(d.slice(firstHard).every((x) => x === 3)).toBe(true)
    }
  })

  it('always includes at least one hard clue, so the Difficult scenes get played', () => {
    // Without a floor a random draw hands some players five Easy scenes and
    // nothing else, and the Difficult clips never reach them.
    for (const r of pool.routes) {
      expect(tiers(r.stops).filter((d) => d === 3).length).toBeGreaterThanOrEqual(
        ROUTE_POOL.minHardClues,
      )
    }
  })

  it('finishes on a hard clue', () => {
    for (const r of pool.routes) expect(tiers(r.stops).at(-1)).toBe(3)
  })

  it('still spreads the opening across the easy locations', () => {
    const firsts = new Set(pool.routes.map((r) => r.stops[0]))
    expect(firsts.size).toBeGreaterThanOrEqual(5)
  })
})

describe('assignRoute', () => {
  it('hands out distinct routes until the pool is exhausted', () => {
    const seen = new Set<string>()
    for (let i = 0; i < pool.routes.length; i++) {
      const r = assignRoute(pool, seen)
      const k = routeKey(r.stops)
      expect(seen.has(k)).toBe(false)
      seen.add(k)
    }
    // One past the end wraps rather than throwing.
    expect(() => assignRoute(pool, seen)).not.toThrow()
  })
})
