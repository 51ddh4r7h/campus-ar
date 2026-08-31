/**
 * AR capability + permission. 3DoF orientation drives the anchored screen.
 * iOS gates DeviceOrientationEvent behind a user-gesture permission call, and
 * some devices expose the API but never emit — so `ready` also requires a real
 * sensor reading. Anything short of that falls back to the flat panel.
 */

interface IosDeviceOrientationEvent {
  requestPermission?: () => Promise<'granted' | 'denied'>
}

class Ar {
  supported = $state(typeof window !== 'undefined' && 'DeviceOrientationEvent' in window)
  permission = $state<'unknown' | 'granted' | 'denied'>('unknown')
  hasReading = $state(false)

  private listening = false
  private requested: Promise<void> | null = null

  /** Safe to mount the AR stage: permission granted and the sensor is live. */
  get ready(): boolean {
    return this.supported && this.permission === 'granted' && this.hasReading
  }

  /** Worth attempting the AR stage even if a reading hasn't arrived yet. */
  get worthTrying(): boolean {
    return this.supported && this.permission !== 'denied'
  }

  private listen(): void {
    if (this.listening || typeof window === 'undefined') return
    this.listening = true
    const onReading = (raw: Event) => {
      const e = raw as DeviceOrientationEvent
      if (e.alpha !== null || e.beta !== null || e.gamma !== null) {
        this.hasReading = true
        window.removeEventListener('deviceorientation', onReading, true)
        window.removeEventListener('deviceorientationabsolute', onReading, true)
      }
    }
    window.addEventListener('deviceorientation', onReading, true)
    window.addEventListener('deviceorientationabsolute', onReading, true)
  }

  /**
   * Idempotent. On iOS this must run inside a user gesture (the permission
   * prompt); on Android it grants instantly. Safe to call from any forward
   * action — camera-enable, camera-skip, or the reveal itself.
   */
  async ensure(): Promise<void> {
    if (!this.supported) return
    if (this.permission === 'granted') return
    if (!this.requested) {
      this.requested = (async () => {
        const doe = window.DeviceOrientationEvent as unknown as IosDeviceOrientationEvent
        if (typeof doe.requestPermission === 'function') {
          try {
            this.permission = await doe.requestPermission()
          } catch {
            // iOS rejects when not called from a user gesture — don't latch to
            // denied, let a later real tap retry.
            this.requested = null
            return
          }
        } else {
          this.permission = 'granted'
        }
        if (this.permission === 'granted') this.listen()
      })()
    }
    await this.requested
  }
}

export const ar = new Ar()
