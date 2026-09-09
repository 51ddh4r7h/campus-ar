import {describe, expect, it} from 'vitest'
import {DEFAULT_PAR_CONSTANTS, HUNT_LIMIT_MS, LOCATIONS, START_POINT} from './index'
import {remainingMsOf, routePar, sessionScoreMs, walkParMs} from './scoring'
import type {Session} from './types'

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

  it('score is elapsed plus what the hints cost, nothing subtracted', () => {
    expect(sessionScoreMs(1_000_000, 90_000)).toBe(1_090_000)
    expect(sessionScoreMs(15 * 60_000, 0)).toBe(15 * 60_000)
  })

  it('the countdown loses both the time spent and the penalties taken', () => {
    const base: Pick<Session, 'startTsMs' | 'endTsMs' | 'pausedAtMs' | 'pausedTotalMs' | 'penaltyMs'> = {
      startTsMs: 0,
      endTsMs: null,
      pausedAtMs: null,
      pausedTotalMs: 0,
      penaltyMs: 0,
    }
    // Ten minutes in, no penalties: fifteen left.
    expect(remainingMsOf(base, 10 * 60_000)).toBe(HUNT_LIMIT_MS - 10 * 60_000)
    // Same ten minutes, but a 5:00 hint was taken: only ten left.
    expect(remainingMsOf({...base, penaltyMs: 5 * 60_000}, 10 * 60_000)).toBe(
      HUNT_LIMIT_MS - 10 * 60_000 - 5 * 60_000,
    )
    // Penalties past the whole clock floor at zero, never negative.
    expect(remainingMsOf({...base, penaltyMs: 40 * 60_000}, 10 * 60_000)).toBe(0)
  })

  it('rejects a wrong stop count', () => {
    expect(() => routePar(LOCATIONS.slice(0, 4), START_POINT, DEFAULT_PAR_CONSTANTS)).toThrow()
  })
})
