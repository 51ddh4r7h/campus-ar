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

  /** Safe to mount the AR stage: permission granted and the sensor is live. */
  get ready(): boolean {
    return this.supported && this.permission === 'granted' && this.hasReading
  }

  private listen(): void {
    if (this.listening || typeof window === 'undefined') return
    this.listening = true
    const onReading = (e: DeviceOrientationEvent) => {
      if (e.alpha !== null || e.beta !== null || e.gamma !== null) {
        this.hasReading = true
        window.removeEventListener('deviceorientation', onReading, true)
      }
    }
    window.addEventListener('deviceorientation', onReading, true)
  }

  async requestPermission(): Promise<void> {
    if (!this.supported) return
    const doe = window.DeviceOrientationEvent as unknown as IosDeviceOrientationEvent
    if (typeof doe.requestPermission === 'function') {
      try {
        this.permission = await doe.requestPermission()
      } catch {
        this.permission = 'denied'
      }
    } else {
      // Android / desktop — no gate.
      this.permission = 'granted'
    }
    if (this.permission === 'granted') this.listen()
  }
}

export const ar = new Ar()
