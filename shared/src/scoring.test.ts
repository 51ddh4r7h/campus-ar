import {describe, expect, it} from 'vitest'
import {DEFAULT_PAR_CONSTANTS, LOCATIONS, START_POINT} from './index'
import {routePar, sessionScoreMs, walkParMs} from './scoring'

describe('scoring', () => {
  it('walk par scales with distance and inverse speed', () => {
    const a = {lat: 18.534, lng: 73.733}
    const b = {lat: 18.537, lng: 73.733}
    const slow = walkParMs(a, b, 1)
    const fast = walkParMs(a, b, 2)
    expect(fast).toBeCloseTo(slow / 2, -2)
    expect(slow).toBeGreaterThan(0)
  })

  it('route par sums its five legs', () => {
    const stops = LOCATIONS.slice(0, 5)
    const par = routePar(stops, START_POINT, DEFAULT_PAR_CONSTANTS)
    expect(par.legMs).toHaveLength(5)
    expect(par.totalMs).toBe(par.legMs.reduce((x, y) => x + y, 0))
    // Every leg carries at least identify + dwell for its difficulty.
    for (let i = 0; i < 5; i++) {
      const min =
        DEFAULT_PAR_CONSTANTS.identifyParMs[stops[i]!.difficulty] +
        DEFAULT_PAR_CONSTANTS.dwellParMs
      expect(par.legMs[i]).toBeGreaterThanOrEqual(min)
    }
  })

  it('score is elapsed plus penalty minus par', () => {
    expect(sessionScoreMs(1_000_000, 90_000, 1_200_000)).toBe(-110_000)
  })

  it('rejects a wrong stop count', () => {
    expect(() => routePar(LOCATIONS.slice(0, 4), START_POINT, DEFAULT_PAR_CONSTANTS)).toThrow()
  })
})
