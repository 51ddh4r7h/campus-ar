/**
 * Geodesy — pure distance helpers. No bearing/heading is exposed anywhere in
 * the product: the game tells a player how close they are, never which way to
 * walk.
 */

export interface LatLng {
  lat: number
  lng: number
}

const EARTH_RADIUS_M = 6_371_000

const toRad = (deg: number): number => (deg * Math.PI) / 180

/** Great-circle distance between two points, in metres. */
export const haversineM = (a: LatLng, b: LatLng): number => {
  const dLat = toRad(b.lat - a.lat)
  const dLng = toRad(b.lng - a.lng)
  const lat1 = toRad(a.lat)
  const lat2 = toRad(b.lat)
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)))
}

/**
 * Speed implied by moving `distanceM` in `elapsedMs`, in metres per second.
 * Returns Infinity for a zero or negative interval so callers treat an
 * instantaneous jump as impossible.
 */
export const impliedSpeedMps = (distanceM: number, elapsedMs: number): number => {
  if (elapsedMs <= 0) return Number.POSITIVE_INFINITY
  return distanceM / (elapsedMs / 1000)
}
