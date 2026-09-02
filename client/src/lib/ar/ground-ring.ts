/**
 * The proximity ring — geometry only.
 *
 * A ring of light on the ground, centred on the player's own feet, that
 * contracts as they close on the target. It is deliberately NOT drawn at the
 * target: our AR is 3DoF and our position is a GPS fix good to ±10-20m, so a
 * marker placed on the destination would be wrong by roughly its own distance
 * at exactly the moment the player looked at it. A marker that lies precisely
 * is worse than none — they would walk to the marker instead of the place.
 *
 * Centred on the player, both error sources stop mattering. GPS cannot
 * misplace a ring that is drawn around wherever you happen to be, and compass
 * error is irrelevant to a circle. It says *near* without ever saying *which
 * way* — which is also what keeps it legal under the rule in geo.ts that the
 * game never tells you a bearing.
 *
 * Projection is done by hand rather than with three.js: this needs only pitch
 * and roll, and a second WebGL context alongside the AR stage is a real risk
 * on a mid-range phone.
 */

/**
 * Below this the ring is not drawn at all.
 *
 * It is the last-stretch instrument, not a search aid. Band 3 ("Hot") is
 * already inside the heat range that shrinks with a compact campus, so on a
 * tight site the ring appears correspondingly late and never becomes a homing
 * beacon during the open search.
 */
export const GATE_HEAT = 64

/** How far outside the frame a ring point may land before it is dropped. */
const BOUND = 1.5

/** Assumed eye height, metres. Wrong by ±0.2m on a real person; harmless. */
export const EYE_HEIGHT_M = 1.5

export interface RingView {
  /** Device pitch below horizontal, radians. 0 = horizon, PI/2 = straight down. */
  pitch: number
  /** Screen roll, radians. */
  roll: number
  /** Vertical field of view, radians. */
  fovY: number
  width: number
  height: number
}

/**
 * Project a ground circle of `radiusM` around the viewer into screen space.
 *
 * Returns null when no part of it is in front of the camera — looking at the
 * sky, say. Points behind the camera are dropped rather than clipped, so a
 * partly-visible ring comes back as an open arc, which is what it should look
 * like when the ring runs off the bottom of the frame.
 */
export function projectRing(
  view: RingView,
  radiusM: number,
  segments = 72,
): Array<[number, number]> | null {
  const {pitch, roll, fovY, width, height} = view
  const h = EYE_HEIGHT_M
  const tanHalf = Math.tan(fovY / 2)
  const aspect = width / height
  const sin = Math.sin(pitch)
  const cos = Math.cos(pitch)

  const pts: Array<[number, number]> = []
  for (let i = 0; i < segments; i++) {
    const phi = (i / segments) * Math.PI * 2
    const px = radiusM * Math.cos(phi)
    const pz = radiusM * Math.sin(phi)

    // World → camera. The camera sits at the origin looking along `forward`,
    // pitched down by `pitch`; the ground is the plane y = -h.
    const depth = h * sin - pz * cos
    if (depth <= 0.05) continue
    const yc = -h * cos - pz * sin

    const ndcX = px / depth / (tanHalf * aspect)
    const ndcY = yc / depth / tanHalf
    const sx = ((ndcX + 1) / 2) * width
    const sy = ((1 - ndcY) / 2) * height
    // Near the horizon the ring goes edge-on and its far side projects to
    // coordinates in the thousands. Those points are geometrically right and
    // visually meaningless — they'd draw a huge V off the bottom of the frame.
    // Dropping them turns the ring into the arc the player can actually see.
    if (Math.abs(sx - width / 2) > width * BOUND || Math.abs(sy - height / 2) > height * BOUND) {
      continue
    }
    pts.push([sx, sy])
  }
  if (pts.length < 3) return null

  if (roll === 0) return pts
  const cx = width / 2
  const cy = height / 2
  const cr = Math.cos(roll)
  const sr = Math.sin(roll)
  return pts.map(([x, y]) => {
    const dx = x - cx
    const dy = y - cy
    return [cx + dx * cr - dy * sr, cy + dx * sr + dy * cr]
  })
}

/** An SVG path. Closed only when the whole ring survived the near-plane cull. */
export function ringPath(pts: Array<[number, number]>, closed: boolean): string {
  const d = pts.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(1)} ${y.toFixed(1)}`).join('')
  return closed ? `${d}Z` : d
}

/**
 * Heat (0-100) → ring radius in metres.
 *
 * Wide and loose when the ring first appears, tightening to a collar around
 * the player's feet as they arrive. The floor is deliberately above zero: a
 * ring that collapses to a point would read as "you have arrived" when the
 * server has not yet said so.
 */
export const radiusForHeat = (heat: number, near = 1.3, far = 7): number => {
  const t = Math.max(0, Math.min(1, (heat - GATE_HEAT) / (100 - GATE_HEAT)))
  return far + (near - far) * t * t
}

/** Pulses per second, rising as the player closes in. */
export const pulseHz = (heat: number): number => 0.5 + Math.max(0, (heat - GATE_HEAT) / (100 - GATE_HEAT)) * 1.3
