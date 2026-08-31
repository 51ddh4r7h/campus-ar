/**
 * The rear camera feed. Phase 2 shows it live behind the HUD and reveal; the AR
 * engine (Phase 3) takes over the same stream. Denial is non-fatal — the game
 * still completes on GPS.
 */

export type CameraState = 'unknown' | 'granted' | 'denied' | 'unavailable'

class Camera {
  stream = $state<MediaStream | null>(null)
  state = $state<CameraState>('unknown')

  get active(): boolean {
    return this.stream !== null
  }

  async start(): Promise<void> {
    if (this.stream) return
    if (!navigator.mediaDevices?.getUserMedia) {
      this.state = 'unavailable'
      return
    }
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({
        video: {facingMode: {ideal: 'environment'}},
        audio: false,
      })
      this.state = 'granted'
    } catch (err) {
      const name = err instanceof DOMException ? err.name : ''
      this.state = name === 'NotAllowedError' || name === 'SecurityError' ? 'denied' : 'unavailable'
    }
  }

  stop(): void {
    this.stream?.getTracks().forEach((t) => t.stop())
    this.stream = null
  }
}

export const camera = new Camera()
