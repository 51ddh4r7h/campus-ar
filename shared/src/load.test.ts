import {describe, expect, it} from 'vitest'
import {POLLING} from './config'

/**
 * The cohort load budget.
 *
 * Not a benchmark — a guard on the polling design. Every interval in POLLING is
 * multiplied by the size of the cohort, so shortening one is a decision about
 * server load, not about responsiveness alone. These assertions are the budget:
 * if a change here fails, work out the cost at full size before raising them.
 */
const PLAYERS = 200

/** Requests per second across the whole cohort at a given interval. */
const rps = (everyMs: number): number => (PLAYERS * 1000) / everyMs

describe('load at a full cohort', () => {
  it('keeps total sustained request rate modest', () => {
    // Standings is excluded: it only runs while the board is on screen.
    const total = rps(POLLING.nearbyMs) + rps(POLLING.crumbFlushMs)
    expect(total).toBeLessThan(60)
  })

  it('keeps the arrival probe cheap enough to poll often', () => {
    // Each call reads player + route + session + at most five splits, all by
    // index. Budget the rows, not the requests.
    const rowsPerSec = rps(POLLING.nearbyMs) * 8
    expect(rowsPerSec).toBeLessThan(500)
  })

  it('keeps sustained D1 writes low', () => {
    // Breadcrumbs are the only thing written continuously.
    expect(rps(POLLING.crumbMinGapMs)).toBeLessThan(60)
  })

  it('never lets a crumb flush carry an unbounded batch', () => {
    const perFlush = POLLING.crumbFlushMs / POLLING.crumbMinGapMs
    expect(perFlush).toBeLessThanOrEqual(5)
  })

  it('polls the board no faster than the cache window it is served from', () => {
    // standings-cache holds a board for 10s; polling faster only adds requests
    // without adding freshness.
    expect(POLLING.standingsMs).toBeGreaterThanOrEqual(10_000)
  })

  it('does not poll the reveal faster than a fix arrives', () => {
    // watchPosition gives roughly one fix a second; polling far below that
    // spends requests re-sending samples the server has already judged.
    expect(POLLING.nearbyRevealMs).toBeGreaterThanOrEqual(2_000)
  })
})
