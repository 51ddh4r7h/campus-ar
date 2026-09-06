import {describe, expect, it} from 'vitest'
import {heatFromDistance, bandFromHeat, LAYOUT} from '@cmh/shared'

/**
 * The meter used to hide itself unless there was warmth to show. These are the
 * numbers that made that wrong: at the moment a player is handed a clue they
 * are, by design, outside the informative range — so the gauge was absent at
 * exactly the moment someone goes looking for it.
 */
describe('warmth at the moment the search starts', () => {
  const radius = 12

  it('reads a flat zero beyond the layout range', () => {
    const beyond = LAYOUT.heatRangeM + 50
    expect(heatFromDistance(beyond, radius)).toBe(0)
    expect(bandFromHeat(heatFromDistance(beyond, radius))).toBe(0)
  })

  it('is zero across the distances a fresh clue is given at', () => {
    // The play area is ~200m across; a new target is usually most of that away.
    for (const d of [80, 120, 160, 200]) {
      expect(heatFromDistance(d, radius), `${d}m`).toBe(0)
    }
  })

  it('only rises once well inside the range, which is the point of it', () => {
    expect(heatFromDistance(LAYOUT.heatRangeM * 0.5, radius)).toBeGreaterThan(0)
    expect(heatFromDistance(radius, radius)).toBe(100)
  })
})
