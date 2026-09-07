/**
 * Confetti physics, kept out of the component that draws it.
 *
 * Separated so it can be tested: the first cut fired both cannons outward off
 * the screen, and the only way to see that in a browser is to watch for it.
 * Numbers are easier to check than pixels.
 */

export interface Piece {
  x: number
  y: number
  /** Velocity in px/ms. */
  vx: number
  vy: number
  w: number
  h: number
  rot: number
  vrot: number
  colour: string
  /** Counts down to nothing; the piece fades over its last third. */
  life: number
  maxLife: number
}

export const COLOURS = ['#e8a54c', '#f5d08a', '#7fd1a6', '#ffffff', '#c98b3f']

const GRAVITY = 0.00055 // px per ms²
const DRAG = 0.9985

export interface Rng {
  (lo: number, hi: number): number
}

export const defaultRng: Rng = (lo, hi) => lo + Math.random() * (hi - lo)

function piece(x: number, y: number, vx: number, vy: number, rng: Rng): Piece {
  const maxLife = rng(1800, 3400)
  return {
    x,
    y,
    vx,
    vy,
    w: rng(6, 11),
    h: rng(8, 15),
    rot: rng(0, Math.PI * 2),
    vrot: rng(-0.006, 0.006),
    colour: COLOURS[Math.min(COLOURS.length - 1, Math.floor(rng(0, COLOURS.length)))]!,
    life: maxLife,
    maxLife,
  }
}

/**
 * The opening bang: two cannons in the bottom corners, both aimed up and
 * *inward*, so the pieces cross the screen the player is looking at.
 */
export function burst(w: number, h: number, count: number, rng: Rng = defaultRng): Piece[] {
  const out: Piece[] = []
  for (let i = 0; i < count; i++) {
    const fromLeft = i % 2 === 0
    // Up and inward: negative vy is up, and the horizontal sign is what aims
    // each cannon at the middle rather than at the wall behind it.
    const lift = rng(0.5, 1.35)
    const sweep = rng(0.25, 0.95)
    const speed = rng(0.55, 1.5)
    out.push(
      piece(
        fromLeft ? rng(-10, 30) : w - rng(-10, 30),
        h - rng(-10, 40),
        (fromLeft ? sweep : -sweep) * speed,
        -lift * speed,
        rng,
      ),
    )
  }
  return out
}

/** A few more drifting down from above, while the burst is still settling. */
export function rain(w: number, count: number, rng: Rng = defaultRng): Piece[] {
  return Array.from({length: count}, () =>
    piece(rng(0, w), rng(-30, -10), rng(-0.05, 0.05), rng(0.05, 0.18), rng),
  )
}

/** How opaque a piece is right now — solid until its last third, then out. */
export const alphaOf = (p: Piece): number => Math.min(1, p.life / (p.maxLife * 0.35))

/**
 * Advance every piece by `dt` ms and drop the ones that are done.
 * Returns a new array; the caller keeps no other reference.
 */
export function step(pieces: readonly Piece[], dt: number, floorY: number): Piece[] {
  const alive: Piece[] = []
  for (const p of pieces) {
    const life = p.life - dt
    if (life <= 0) continue
    const vy = p.vy + GRAVITY * dt
    const vx = p.vx * DRAG
    const next: Piece = {
      ...p,
      life,
      vx,
      vy,
      x: p.x + vx * dt,
      y: p.y + vy * dt,
      rot: p.rot + p.vrot * dt,
    }
    if (next.y > floorY + 40) continue
    alive.push(next)
  }
  return alive
}
