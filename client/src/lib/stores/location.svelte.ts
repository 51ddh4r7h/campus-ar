/**
 * Position source — real device GPS or the demo simulator. Keeps a rolling
 * buffer of recent samples (for arrival checks) and flushes breadcrumbs to the
 * Worker on a timer.
 */

import {START_POINT, VALIDATION, haversineM, locationById, type GeoSample} from '@cmh/shared'
import {api} from '../api'
import {recentSamples, trimBuffer} from '../geo-buffer'
import {game} from './game.svelte'

type Mode = 'off' | 'real' | 'sim'
export type PermissionState = 'unknown' | 'granted' | 'denied' | 'unavailable'

const BUFFER_MS = 60_000
const CRUMB_FLUSH_MS = 15_000
/** How long the demo simulator takes to "walk" one leg. */
const SIM_LEG_MS = 22_000

class Location {
  mode = $state<Mode>('off')
  permission = $state<PermissionState>('unknown')
  fix = $state<GeoSample | null>(null)

  private buffer: GeoSample[] = []
  private crumbs: GeoSample[] = []
  private watchId: number | null = null
  private simTimer: ReturnType<typeof setInterval> | null = null
  private flushTimer: ReturnType<typeof setInterval> | null = null
  private simStart = 0
  private simFrom = START_POINT

  /** Age of the newest fix, ms. */
  get fixAgeMs(): number {
    return this.fix ? Date.now() - this.fix.tsMs : Number.POSITIVE_INFINITY
  }
  get hasSignal(): boolean {
    return this.fix !== null && this.fixAgeMs < VALIDATION.maxFixAgeMs
  }

  /** Samples from the last ~30s — what an arrival check is evaluated against. */
  recent(): GeoSample[] {
    return recentSamples(this.buffer, Date.now())
  }

  start(mode: 'real' | 'sim'): void {
    if (this.mode === mode) return
    this.stop()
    this.mode = mode
    this.flushTimer = setInterval(() => void this.flush(), CRUMB_FLUSH_MS)
    if (mode === 'real') this.startReal()
    else this.startSim()
  }

  stop(): void {
    if (this.watchId !== null) navigator.geolocation.clearWatch(this.watchId)
    if (this.simTimer) clearInterval(this.simTimer)
    if (this.flushTimer) clearInterval(this.flushTimer)
    this.watchId = this.simTimer = this.flushTimer = null
    this.mode = 'off'
  }

  private ingest(s: GeoSample): void {
    this.fix = s
    this.buffer.push(s)
    this.crumbs.push(s)
    this.buffer = trimBuffer(this.buffer, Date.now(), BUFFER_MS)
  }

  private async flush(): Promise<void> {
    if (this.crumbs.length === 0 || !game.token) return
    const batch = this.crumbs.splice(0, this.crumbs.length)
    try {
      await api.breadcrumbs(
        game.token,
        batch.map((s) => ({lat: s.lat, lng: s.lng, accuracyM: s.accuracyM, tsMs: s.tsMs})),
      )
    } catch {
      /* keep going; breadcrumbs are best-effort */
    }
  }

  private startReal(): void {
    if (!('geolocation' in navigator)) {
      this.permission = 'unavailable'
      return
    }
    this.watchId = navigator.geolocation.watchPosition(
      (pos) => {
        this.permission = 'granted'
        this.ingest({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracyM: pos.coords.accuracy,
          tsMs: Date.now(),
          simulated: false,
        })
      },
      (err) => {
        this.permission = err.code === err.PERMISSION_DENIED ? 'denied' : 'unavailable'
      },
      {enableHighAccuracy: true, maximumAge: 5_000, timeout: 20_000},
    )
  }

  // ---- simulator: walk from the last point toward the current target ----
  private startSim(): void {
    this.permission = 'granted'
    this.simStart = performance.now()
    this.simFrom = START_POINT
    const step = () => {
      const target = this.simTarget()
      if (!target) {
        // hunt done — just sit still
        if (this.fix) this.ingest({...this.fix, tsMs: Date.now()})
        return
      }
      const t = Math.min(1, (performance.now() - this.simStart) / SIM_LEG_MS)
      const eased = t * t * (3 - 2 * t)
      const lat = this.simFrom.lat + (target.lat - this.simFrom.lat) * eased
      const lng = this.simFrom.lng + (target.lng - this.simFrom.lng) * eased
      this.ingest({lat, lng, accuracyM: 4, tsMs: Date.now(), simulated: true})

      // Once parked well inside the radius, hold here and re-anchor for the
      // next leg the moment the server advances the level.
      if (eased >= 1 && haversineM({lat, lng}, target) < target.radiusM * 0.5) {
        this.simFrom = {lat, lng}
        this.simStart = performance.now()
      }
    }
    step()
    this.simTimer = setInterval(step, 1_200)
  }

  private simTarget(): {lat: number; lng: number; radiusM: number} | null {
    const id = game.demoStops[game.level - 1]
    const loc = id ? locationById(id) : undefined
    return loc ? {lat: loc.lat, lng: loc.lng, radiusM: loc.radiusM} : null
  }
}

export const location = new Location()
