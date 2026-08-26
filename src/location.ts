/**
 * Geolocation handling — the single source of position for the whole app.
 *
 * Phase 1 had no GPS code in the repo (it was pure AR), so this module *is* the
 * location engine the proximity gate and AR gating share. It intentionally
 * exposes NO heading/bearing — the hunt must never point the user in a
 * direction, only tell them how warm they are.
 *
 * Also includes a simulator (`?sim` in the URL) that walks a fake path near
 * each spot, so the full hunt flow can be demoed and tested without leaving
 * your desk.
 */

export interface GeoFix {
  lat: number
  lng: number
  /** Reported accuracy in metres (0 for simulated fixes). */
  accuracyM: number
  /** True when the fix came from the simulator. */
  simulated: boolean
}

export const haversineM = (aLat: number, aLng: number, bLat: number, bLng: number): number => {
  const R = 6371000
  const toRad = (n: number): number => (n * Math.PI) / 180
  const dLat = toRad(bLat - aLat)
  const dLng = toRad(bLng - aLng)
  const lat1 = toRad(aLat)
  const lat2 = toRad(bLat)
  const a =
    Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(a))
}

/** Distance from a fix to a lat/lng pair. */
export const distanceM = (fix: GeoFix, lat: number, lng: number): number =>
  haversineM(fix.lat, fix.lng, lat, lng)

export interface LocationController {
  start(): void
  stop(): void
  /** One-shot fresh fix delivered through the same onFix path (retry UI). */
  refix(): void
}

/**
 * Start watching the real device location.
 * @param onFix called with each fresh fix.
 * @param onError called with the geolocation error code (1 = permission denied).
 */
export const startRealLocation = (
  onFix: (fix: GeoFix) => void,
  onError?: (code: number) => void,
): LocationController => {
  let watchId: number | null = null

  watchId = navigator.geolocation.watchPosition(
    (pos) => {
      // Skip reports older than 20 s — a stale fix would fake "warmth".
      if (pos.timestamp && Date.now() - pos.timestamp > 20000) return
      onFix({lat: pos.coords.latitude, lng: pos.coords.longitude, accuracyM: pos.coords.accuracy, simulated: false})
    },
    (err) => onError?.(err.code),
    {enableHighAccuracy: true, maximumAge: 10000, timeout: 20000},
  )

  return {
    start: () => {
      /* watchPosition already started above */
    },
    stop: () => {
      if (watchId !== null) navigator.geolocation.clearWatch(watchId)
      watchId = null
    },
    // One-shot fresh fix — the retry button's path, same onFix sink.
    refix: () => {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          if (pos.timestamp && Date.now() - pos.timestamp > 20000) return
          onFix({lat: pos.coords.latitude, lng: pos.coords.longitude, accuracyM: pos.coords.accuracy, simulated: false})
        },
        (err) => onError?.(err.code),
        {enableHighAccuracy: true, timeout: 12000},
      )
    },
  }
}

export type SimStep = (elapsedMs: number) => GeoFix

/**
 * Simulator: teleports the user in easy steps toward the nearest unfound spot,
 * then inside it, then on to the next. Callers drive frequency; 6 s apart is
 * pleasant.
 */
export const makeSimulator = (targets: Array<{lat: number; lng: number}>): SimStep => {
  let target = 0
  // Start cold: south-east outside every spot's bounding box, so the hunt
  // always opens on a genuine "Cold" signal regardless of spot layout.
  const lats = targets.map((t) => t.lat)
  const lngs = targets.map((t) => t.lng)
  let start = {lat: Math.min(...lats) - 0.0009, lng: Math.max(...lngs) + 0.0016}
  let startTime = 0

  const step = (elapsedMs: number): GeoFix => {
    if (elapsedMs - startTime > 0) {
      const t = Math.min(1, (elapsedMs - startTime) / 4500)
      const eased = t * t * (3 - 2 * t) // smoothstep toward the target
      const lat = start.lat + (targets[target].lat - start.lat) * eased
      const lng = start.lng + (targets[target].lng - start.lng) * eased
      // Once close enough, snap inside the radius and move to the next spot.
      if (eased >= 1) {
        start = {lat, lng}
        startTime = elapsedMs
        target = (target + 1) % targets.length
      }
      return {lat, lng, accuracyM: 0, simulated: true}
    }
    return {lat: start.lat, lng: start.lng, accuracyM: 0, simulated: true}
  }
  return step
}

/** Start a simulated location feed that drifts between the given targets. */
export const startSimulatedFixer = (
  targets: Array<{lat: number; lng: number}>,
  onFix: (fix: GeoFix) => void,
): LocationController => {
  const sim = makeSimulator(targets)
  const startedAt = performance.now()
  const push = (): void => {
    onFix(sim(performance.now() - startedAt))
  }
  push()
  const handle = window.setInterval(push, 1200)
  return {
    start: () => {
      /* already running */
    },
    stop: () => window.clearInterval(handle),
    // The simulator pushes continuously; a one-shot re-fix is meaningless.
    refix: () => undefined,
  }
}

/** True if the URL carries `?sim` (or `?simulate`). */
export const wantsSimulation = (): boolean =>
  /[?&](sim|simulate)=?/.test(window.location.search)