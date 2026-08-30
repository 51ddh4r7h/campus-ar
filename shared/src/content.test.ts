import {describe, expect, it} from 'vitest'
import {haversineM} from './geo'
import {LOCATIONS} from './content'
import {LOCATION_POOL_SIZE} from './config'

describe('location content invariants', () => {
  it('has exactly the pool size', () => {
    expect(LOCATIONS).toHaveLength(LOCATION_POOL_SIZE)
  })

  it('has unique ids', () => {
    const ids = new Set(LOCATIONS.map((l) => l.id))
    expect(ids.size).toBe(LOCATIONS.length)
  })

  it('keeps every pair of locations more than 60 m apart', () => {
    for (let i = 0; i < LOCATIONS.length; i++) {
      for (let j = i + 1; j < LOCATIONS.length; j++) {
        const a = LOCATIONS[i]!
        const b = LOCATIONS[j]!
        const d = haversineM(a, b)
        expect(d, `${a.id} ↔ ${b.id}`).toBeGreaterThan(60)
      }
    }
  })

  it('radii never overlap a neighbouring location', () => {
    for (let i = 0; i < LOCATIONS.length; i++) {
      for (let j = i + 1; j < LOCATIONS.length; j++) {
        const a = LOCATIONS[i]!
        const b = LOCATIONS[j]!
        expect(haversineM(a, b), `${a.id} ↔ ${b.id}`).toBeGreaterThan(a.radiusM + b.radiusM)
      }
    }
  })

  it('has a balanced difficulty mix', () => {
    const counts = {1: 0, 2: 0, 3: 0}
    for (const l of LOCATIONS) counts[l.difficulty]++
    expect(counts[1]).toBeGreaterThanOrEqual(2)
    expect(counts[3]).toBeGreaterThanOrEqual(2)
    expect(counts[1] + counts[2] + counts[3]).toBe(10)
  })

  it('never names the building or a direction in the far clue', () => {
    const banned = /\b(north|south|east|west|library|auditorium|fountain|studio|pavilion|observatory|boulevard|amphitheatre)\b/i
    for (const l of LOCATIONS) {
      expect(banned.test(l.clue.far), `${l.id} far clue leaks`).toBe(false)
    }
  })
})
