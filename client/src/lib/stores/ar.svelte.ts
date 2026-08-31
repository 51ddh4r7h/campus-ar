/**
 * AR capability + permission. 3DoF orientation drives the anchored screen;
 * iOS gates DeviceOrientationEvent behind a user-gesture permission call.
 */

interface IosDeviceOrientationEvent {
  requestPermission?: () => Promise<'granted' | 'denied'>
}

class Ar {
  supported = $state(typeof window !== 'undefined' && 'DeviceOrientationEvent' in window)
  permission = $state<'unknown' | 'granted' | 'denied'>('unknown')

  get ready(): boolean {
    return this.supported && this.permission === 'granted'
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
  }
}

export const ar = new Ar()
