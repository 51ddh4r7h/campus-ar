/**
 * The rear camera feed. Phase 2 shows it live behind the HUD and reveal; the AR
 * engine (Phase 3) takes over the same stream. Denial is non-fatal — the game
 * still completes on GPS.
 */

export type CameraState = 'unknown' | 'granted' | 'denied' | 'unavailable'

class Camera {
  stream = $state<MediaStream | null>(null)
  state = $state<CameraState>('unknown')
  /** The stream ended on its own (OS revoked it, another app grabbed it). */
  lost = $state(false)

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
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {facingMode: {ideal: 'environment'}},
        audio: false,
      })
      stream.getVideoTracks().forEach((t) => {
        t.addEventListener('ended', () => {
          if (this.stream === stream) {
            this.stream = null
            this.lost = true
          }
        })
      })
      this.stream = stream
      this.state = 'granted'
      this.lost = false
    } catch (err) {
      const name = err instanceof DOMException ? err.name : ''
      this.state = name === 'NotAllowedError' || name === 'SecurityError' ? 'denied' : 'unavailable'
    }
  }

  async retry(): Promise<void> {
    this.lost = false
    await this.start()
  }

  stop(): void {
    this.stream?.getTracks().forEach((t) => t.stop())
    this.stream = null
    this.lost = false
  }
}

export const camera = new Camera()
