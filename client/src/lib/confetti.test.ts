import {describe, expect, it} from 'vitest'
import {alphaOf, burst, rain, step, type Piece, type Rng} from './confetti'

/** Midpoint of every range, so a piece's path is exactly predictable. */
const mid: Rng = (lo, hi) => (lo + hi) / 2

const W = 400
const H = 800

/** Run the simulation to exhaustion, capped so a leak fails rather than hangs. */
function settle(pieces: Piece[], stepMs = 16) {
  const seen: Piece[] = []
  let live = pieces
  let frames = 0
  while (live.length > 0 && frames < 2000) {
    live = step(live, stepMs, H)
    seen.push(...live)
    frames++
  }
  return {frames, seen}
}

describe('confetti burst', () => {
  it('fires both cannons inward, not out through the walls', () => {
    // The bug this pins: the first cut sent the left cannon further left and
    // the right one further right, so a full-screen celebration played
    // entirely off-screen. Nothing on a canvas can tell you that.
    const pieces = burst(W, H, 8, mid)
    const left = pieces.filter((p) => p.x < W / 2)
    const right = pieces.filter((p) => p.x >= W / 2)

    expect(left.length).toBeGreaterThan(0)
    expect(right.length).toBeGreaterThan(0)
    expect(left.every((p) => p.vx > 0)).toBe(true)
    expect(right.every((p) => p.vx < 0)).toBe(true)
  })

  it('launches upward from the bottom of the screen', () => {
    const pieces = burst(W, H, 6, mid)
    expect(pieces.every((p) => p.vy < 0)).toBe(true)
    expect(pieces.every((p) => p.y > H * 0.9)).toBe(true)
  })

  it('actually crosses the visible area', () => {
    const {seen} = settle(burst(W, H, 8, mid))
    const onScreen = seen.filter((p) => p.x > 0 && p.x < W && p.y > 0 && p.y < H)
    expect(onScreen.length).toBeGreaterThan(0)
  })
})

describe('confetti lifetime', () => {
  it('stops on its own — a celebration that never ends is a battery bug', () => {
    const {frames} = settle(burst(W, H, 40, mid))
    expect(frames).toBeGreaterThan(1)
    // 3.4s is the longest life; at 16ms a frame that is ~215 frames.
    expect(frames).toBeLessThan(400)
  })

  it('survives a backgrounded tab returning with one huge delta', () => {
    // The component clamps dt, but the physics must not produce NaN or hang if
    // a large step gets through.
    let live = burst(W, H, 20, mid)
    live = step(live, 5_000, H)
    expect(live.every((p) => Number.isFinite(p.x) && Number.isFinite(p.y))).toBe(true)
  })

  it('fades over the last third rather than vanishing', () => {
    const p = burst(W, H, 2, mid)[0]!
    expect(alphaOf(p)).toBe(1)
    expect(alphaOf({...p, life: p.maxLife * 0.1})).toBeLessThan(1)
    expect(alphaOf({...p, life: 1})).toBeGreaterThan(0)
  })
})

describe('confetti rain', () => {
  it('starts above the screen and falls into it', () => {
    const pieces = rain(W, 5, mid)
    expect(pieces.every((p) => p.y < 0)).toBe(true)
    expect(pieces.every((p) => p.vy > 0)).toBe(true)
    expect(pieces.every((p) => p.x >= 0 && p.x <= W)).toBe(true)
  })
})
