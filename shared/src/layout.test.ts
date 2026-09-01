import {describe, expect, it} from 'vitest'
import {ABSOLUTE_MIN_SPACING_M, MIN_RADIUS_M, deriveLimits, nearestNeighbourM, safeRadiusM} from './layout'
import {haversineM, type LatLng} from './geo'

/** A row of points `gapM` apart, running east from the campus centre. */
const row = (count: number, gapM: number): LatLng[] => {
  const degPerM = 1 / (111_320 * Math.cos((18.535 * Math.PI) / 180))
  return Array.from({length: count}, (_, i) => ({lat: 18.535, lng: 73.733 + i * gapM * degPerM}))
}

describe('layout limits', () => {
  it('measures the gap it was built from', () => {
    const pts = row(5, 40)
    expect(nearestNeighbourM(pts[0]!, pts)).toBeCloseTo(40, 0)
    expect(deriveLimits(pts).minSpacingM).toBeCloseTo(40, 0)
  })

  it('tightens every threshold as the stops pack closer', () => {
    const roomy = deriveLimits(row(5, 90))
    const tight = deriveLimits(row(5, 30))

    expect(tight.maxAccuracyM).toBeLessThan(roomy.maxAccuracyM)
    expect(tight.heatRangeM).toBeLessThan(roomy.heatRangeM)
    expect(tight.minLegMs).toBeLessThan(roomy.minLegMs)
  })

  it('never lets two geofences meet', () => {
    for (const gap of [25, 40, 60, 120]) {
      const pts = row(4, gap)
      const r = safeRadiusM(pts[1]!, pts, 18)
      // Two neighbouring fences of this radius must still leave a gap between them.
      expect(r * 2).toBeLessThan(gap)
    }
  })

  it('keeps a fence satisfiable even when stops are jammed together', () => {
    expect(safeRadiusM(row(3, 12)[1]!, row(3, 12), 18)).toBeGreaterThanOrEqual(MIN_RADIUS_M)
  })

  it('refuses to call an unresolvable layout playable', () => {
    const tooClose = deriveLimits(row(4, ABSOLUTE_MIN_SPACING_M - 5))
    expect(tooClose.warnings).toHaveLength(1)
    expect(tooClose.warnings[0]).toMatch(/apart/)

    expect(deriveLimits(row(4, 45)).warnings).toHaveLength(0)
  })

  it('accepts an accuracy bar that can actually separate neighbours', () => {
    for (const gap of [25, 40, 80]) {
      const {maxAccuracyM} = deriveLimits(row(4, gap))
      // A trusted fix must be finer than half the gap, or it cannot say which
      // stop you are standing at.
      expect(maxAccuracyM).toBeLessThanOrEqual(gap / 2)
    }
  })

  it('derives a leg floor a real walk between neighbours can beat', () => {
    for (const gap of [25, 40, 80]) {
      const {minLegMs} = deriveLimits(row(4, gap))
      const strollMs = (gap / 1.3) * 1000
      expect(minLegMs).toBeLessThan(strollMs)
    }
  })
})

describe('spacing sanity', () => {
  it('row() really does space points as asked', () => {
    const pts = row(3, 50)
    expect(haversineM(pts[0]!, pts[1]!)).toBeCloseTo(50, 0)
  })
})
