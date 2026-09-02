import {describe, expect, it} from 'vitest'
import {haversineM} from './geo'
import {LAYOUT, LOCATIONS} from './content'
import {LOCATION_POOL_SIZE} from './config'

describe('location content invariants', () => {
  it('has exactly the pool size', () => {
    expect(LOCATIONS).toHaveLength(LOCATION_POOL_SIZE)
  })

  it('has unique ids', () => {
    const ids = new Set(LOCATIONS.map((l) => l.id))
    expect(ids.size).toBe(LOCATIONS.length)
  })

  // The stops may sit close together — the derived radii are what keep them
  // separable, so assert the outcome rather than a fixed minimum spacing.
  it('no two geofences touch, however tightly packed', () => {
    for (let i = 0; i < LOCATIONS.length; i++) {
      for (let j = i + 1; j < LOCATIONS.length; j++) {
        const a = LOCATIONS[i]!
        const b = LOCATIONS[j]!
        expect(haversineM(a, b), `${a.id} ↔ ${b.id}`).toBeGreaterThan(a.radiusM + b.radiusM)
      }
    }
  })

  it('is a layout the engine calls playable', () => {
    expect(LAYOUT.warnings).toEqual([])
  })

  it('trusts only fixes fine enough to tell neighbouring stops apart', () => {
    expect(LAYOUT.maxAccuracyM).toBeLessThanOrEqual(LAYOUT.minSpacingM / 2)
  })

  it('keeps every geofence satisfiable', () => {
    for (const l of LOCATIONS) {
      expect(l.radiusM, `${l.id} fence`).toBeGreaterThanOrEqual(6)
    }
  })

  it('has a balanced difficulty mix', () => {
    const counts = {1: 0, 2: 0, 3: 0}
    for (const l of LOCATIONS) counts[l.difficulty]++
    expect(counts[1]).toBeGreaterThanOrEqual(2)
    expect(counts[3]).toBeGreaterThanOrEqual(2)
    expect(counts[1] + counts[2] + counts[3]).toBe(LOCATION_POOL_SIZE)
  })

  // Self-maintaining: derived from the location list rather than a hand-kept
  // word list, so it keeps working when the real scenes replace these.
  it('never gives the answer away in the far clue', () => {
    const directions = /\b(north|south|east|west)\b/i
    for (const l of LOCATIONS) {
      expect(directions.test(l.clue.far), `${l.id} far clue points a compass`).toBe(false)
      for (const other of LOCATIONS) {
        const word = other.name.toLowerCase()
        expect(
          l.clue.far.toLowerCase().includes(word),
          `${l.id} far clue names "${other.name}"`,
        ).toBe(false)
      }
    }
  })

})
