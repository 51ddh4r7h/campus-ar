import {describe, expect, it} from 'vitest'
import type {GameLocation, GeoSample} from './types'
import {VALIDATION} from './config'
import {LAYOUT, LOCATIONS} from './content'
import {evaluateArrival} from './validation'

const [L1, L2, L3] = LOCATIONS as unknown as [GameLocation, GameLocation, GameLocation]

/** Samples parked at a lat/lng for `spanMs`, one every 3 s, ending at `endTsMs`. */
const parkedAt = (
  point: {lat: number; lng: number},
  endTsMs: number,
  spanMs: number,
  accuracyM = 6,
): GeoSample[] => {
  const out: GeoSample[] = []
  for (let t = endTsMs; t >= endTsMs - spanMs; t -= 3_000) {
    out.push({lat: point.lat, lng: point.lng, accuracyM, tsMs: t, simulated: false})
  }
  return out
}

const DWELL_OK = VALIDATION.dwellMs + 3_000

const NOW = 1_000_000

describe('evaluateArrival', () => {
  it('passes when parked inside the target long enough', () => {
    const r = evaluateArrival({
      routeStops: [L1, L2, L3],
      currentLevel: 1,
      prevReachedTsMs: NOW - 120_000,
      samples: parkedAt(L1, NOW, DWELL_OK),
      nowMs: NOW,
    })
    expect(r.ok).toBe(true)
    expect(r.reachedTsMs).toBe(NOW)
  })

  it('fails dwell when inside only briefly', () => {
    const r = evaluateArrival({
      routeStops: [L1, L2, L3],
      currentLevel: 1,
      prevReachedTsMs: NOW - 120_000,
      samples: parkedAt(L1, NOW, 8_000),
      nowMs: NOW,
    })
    expect(r).toMatchObject({ok: false, failure: 'dwell'})
  })

  it('fails wrong_location when nowhere near any route stop', () => {
    const r = evaluateArrival({
      routeStops: [L1, L2, L3],
      currentLevel: 1,
      prevReachedTsMs: NOW - 120_000,
      samples: parkedAt({lat: 18.525, lng: 73.72}, NOW, DWELL_OK),
      nowMs: NOW,
    })
    expect(r).toMatchObject({ok: false, failure: 'wrong_location'})
  })

  it('reports level_locked when standing at a later stop', () => {
    const r = evaluateArrival({
      routeStops: [L1, L2, L3],
      currentLevel: 1,
      prevReachedTsMs: NOW - 120_000,
      samples: parkedAt(L3, NOW, DWELL_OK),
      nowMs: NOW,
    })
    expect(r).toMatchObject({ok: false, failure: 'level_locked'})
  })

  it('rejects poor-accuracy fixes at the target as signal', () => {
    const r = evaluateArrival({
      routeStops: [L1, L2, L3],
      currentLevel: 1,
      prevReachedTsMs: NOW - 120_000,
      samples: parkedAt(L1, NOW, DWELL_OK, LAYOUT.maxAccuracyM + 40),
      nowMs: NOW,
    })
    expect(r).toMatchObject({ok: false, failure: 'signal'})
  })

  it('fails too_fast when the leg is shorter than the floor', () => {
    const r = evaluateArrival({
      routeStops: [L1, L2, L3],
      currentLevel: 2,
      prevReachedTsMs: NOW - (LAYOUT.minLegMs - 5_000),
      samples: parkedAt(L2, NOW, DWELL_OK),
      nowMs: NOW,
    })
    expect(r).toMatchObject({ok: false, failure: 'too_fast'})
  })

  it('flags but passes an implausibly fast plausible-length leg', () => {
    // Long enough not to trip minLegMs, but far too fast for the distance.
    const r = evaluateArrival({
      routeStops: [L1, L2, L3],
      currentLevel: 2,
      prevReachedTsMs: NOW - (LAYOUT.minLegMs + 2_000),
      samples: parkedAt(L2, NOW, VALIDATION.dwellMs + 2_000),
      nowMs: NOW,
    })
    expect(r.ok).toBe(true)
    expect(r.flagged).toBe(true)
  })

  it('accepts simulated fixes regardless of accuracy', () => {
    const samples: GeoSample[] = parkedAt(L1, NOW, DWELL_OK, 999).map(
      (s) => ({...s, simulated: true}),
    )
    const r = evaluateArrival({
      routeStops: [L1, L2, L3],
      currentLevel: 1,
      prevReachedTsMs: NOW - 120_000,
      samples,
      nowMs: NOW,
    })
    expect(r.ok).toBe(true)
  })
})
