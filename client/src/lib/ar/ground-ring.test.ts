import {describe, expect, it} from 'vitest'
import {EYE_HEIGHT_M, GATE_HEAT, projectRing, radiusForHeat, ringPath} from './ground-ring'

const W = 390
const H = 844
const CX = W / 2
const CY = H / 2

const view = (pitch: number) => ({
  pitch,
  roll: 0,
  fovY: (70 * Math.PI) / 180,
  width: W,
  height: H,
})

describe('projectRing', () => {
  it('shows the near arc along the bottom when looking at the horizon', () => {
    // The bottom of a 70-degree frame held level looks down about 35 degrees,
    // which meets the ground some 2m out. So the near edge of the ring is on
    // screen even while the player is looking straight ahead at buildings —
    // which is the whole point: it has to register in peripheral vision.
    const pts = projectRing(view(0), 3)
    expect(pts).not.toBeNull()
    expect(pts!.length).toBeGreaterThan(6)
    expect(pts!.length).toBeLessThan(72)
    // Everything that survives sits in the lower half of the frame.
    for (const [, y] of pts!) expect(y).toBeGreaterThan(CY)
  })

  it('shows nothing when the phone is pointed at the sky', () => {
    expect(projectRing(view(-Math.PI / 4), 3)).toBeNull()
  })

  it('gives a closed ring when looking down at your own feet', () => {
    // Straight down from 1.5m, the frame only spans about a metre of ground,
    // so this is the radius a real arrival ring closes to.
    const pts = projectRing(view(Math.PI / 2), 0.7)
    expect(pts).not.toBeNull()
    expect(pts!.length).toBe(72)
  })

  it('centres that ring on the frame', () => {
    const pts = projectRing(view(Math.PI / 2), 0.7)!
    const cx = pts.reduce((a, [x]) => a + x, 0) / pts.length
    const cy = pts.reduce((a, [, y]) => a + y, 0) / pts.length
    expect(cx).toBeCloseTo(CX, 0)
    expect(cy).toBeCloseTo(CY, 0)
  })

  it('returns an open arc when part of the ring leaves the frame', () => {
    const pts = projectRing(view(Math.PI / 3), 3)
    expect(pts).not.toBeNull()
    expect(pts!.length).toBeLessThan(72)
    expect(pts!.length).toBeGreaterThan(2)
  })

  it('puts a bigger ring further from centre', () => {
    const spread = (p: Array<[number, number]>) => Math.max(...p.map(([x]) => Math.abs(x - CX)))
    expect(spread(projectRing(view(Math.PI / 2), 0.7)!)).toBeGreaterThan(
      spread(projectRing(view(Math.PI / 2), 0.3)!),
    )
  })

  it('agrees with hand-computed geometry on the view axis', () => {
    // Looking 45 degrees down, the ground point at horizontal distance
    // EYE_HEIGHT_M directly ahead lies exactly on the view axis, so it must
    // land dead centre. Checks the projection against maths, not itself.
    const pts = projectRing(view(Math.PI / 4), EYE_HEIGHT_M)!
    const onAxis = pts.filter(([x, y]) => Math.abs(x - CX) < 1 && Math.abs(y - CY) < 1)
    expect(onAxis.length).toBe(1)
  })

  it('keeps every returned point near the frame', () => {
    for (const pitch of [Math.PI / 8, Math.PI / 4, Math.PI / 3, Math.PI / 2]) {
      for (const [x, y] of projectRing(view(pitch), 2) ?? []) {
        expect(Math.abs(x - CX)).toBeLessThanOrEqual(W * 1.5)
        expect(Math.abs(y - CY)).toBeLessThanOrEqual(H * 1.5)
      }
    }
  })

  it('rolls the ring with the phone', () => {
    const upright = projectRing(view(Math.PI / 2), 0.7)!
    const rolled = projectRing({...view(Math.PI / 2), roll: Math.PI / 2}, 0.7)!
    // A roll about the frame centre preserves every point's distance from it.
    const rad = (p: Array<[number, number]>) =>
      p.map(([x, y]) => Math.hypot(x - CX, y - CY)).sort((a, b) => a - b)
    rad(rolled).forEach((r, i) => expect(r).toBeCloseTo(rad(upright)[i]!, 6))
    expect(rolled[0]![0]).not.toBeCloseTo(upright[0]![0], 1)
  })
})

describe('ringPath', () => {
  it('closes a full ring and leaves an arc open', () => {
    const pts: Array<[number, number]> = [
      [0, 0],
      [1, 1],
      [2, 0],
    ]
    expect(ringPath(pts, true).endsWith('Z')).toBe(true)
    expect(ringPath(pts, false).endsWith('Z')).toBe(false)
  })
})

describe('radiusForHeat', () => {
  it('is widest at the gate and tightest on arrival', () => {
    expect(radiusForHeat(GATE_HEAT)).toBeCloseTo(7, 5)
    expect(radiusForHeat(100)).toBeCloseTo(1.3, 5)
  })

  it('never collapses to a point, so it cannot pose as an arrival', () => {
    expect(radiusForHeat(100)).toBeGreaterThan(1)
  })

  it('contracts monotonically', () => {
    const rs = [64, 72, 80, 90, 100].map((h) => radiusForHeat(h))
    for (let i = 1; i < rs.length; i++) expect(rs[i]!).toBeLessThan(rs[i - 1]!)
  })
})
