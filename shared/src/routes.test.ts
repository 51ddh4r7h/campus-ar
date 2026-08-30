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

  it('difficulty sums span at most one', () => {
    const sums = new Set(pool.routes.map((r) => r.difficultySum))
    expect(Math.max(...sums) - Math.min(...sums)).toBeLessThanOrEqual(
      ROUTE_POOL.difficultySpread,
    )
  })

  it('par times are tightly banded', () => {
    const pars = pool.routes.map((r) => r.parTotalMs)
    expect(Math.max(...pars) - Math.min(...pars)).toBeLessThanOrEqual(
      ROUTE_POOL.walkTimeBandMs,
    )
    expect(pool.relaxed).toBe(false)
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
