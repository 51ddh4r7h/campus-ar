/**
 * Haptics — a thin wrapper over the Vibration API with feature detection.
 * Android Chrome vibrates for real; iOS Safari has no web vibration API, so
 * there every call is a silent no-op and the on-screen motion carries the beat.
 */

type Pattern = number | number[]
type VibratingNavigator = Navigator & {vibrate(pattern: Pattern): boolean}

const canVibrate = (n: Navigator): n is VibratingNavigator =>
  'vibrate' in n && typeof (n as VibratingNavigator).vibrate === 'function'

const buzz = (pattern: Pattern): void => {
  if (canVibrate(navigator)) navigator.vibrate(pattern)
}

/**
 * A pulse that quickens as the screen assembles.
 *
 * The 20-second dwell at arrival is anti-cheat, and it used to be dead time.
 * Beating through it — slow at first, urgent as the picture fills in — turns
 * the wait into something that reads as the machine spinning up, so a player
 * standing still feels progress rather than delay. Discrete taps at events
 * could never do that, because the wait is the thing that needs describing.
 */
class BuildPulse {
  private timer: ReturnType<typeof setTimeout> | null = null
  private progress = 0

  /** `p` is 0-1 assembly progress. Call as often as it changes. */
  set(p: number): void {
    this.progress = Math.max(0, Math.min(1, p))
    if (this.timer === null && this.progress > 0) this.beat()
  }

  stop(): void {
    if (this.timer !== null) clearTimeout(this.timer)
    this.timer = null
    this.progress = 0
  }

  private beat(): void {
    if (this.progress <= 0 || this.progress >= 1) {
      this.stop()
      return
    }
    // 1100ms between beats at the start, 260ms as it completes.
    const gap = 1100 - 840 * this.progress
    buzz(6 + Math.round(this.progress * 10))
    this.timer = setTimeout(() => this.beat(), gap)
  }
}

export const buildPulse = new BuildPulse()

export const haptics = {
  supported: (): boolean => canVibrate(navigator),
  /** UI tap — button presses, heat-band crossings. */
  tick: () => buzz(8),
  /** You've entered a scene's radius. */
  arrive: () => buzz([14, 60, 22]),
  /** The world-anchored screen has locked into place. */
  revealLock: () => buzz([30, 25, 70]),
  /** A level is done. */
  levelDone: () => buzz([12, 40, 12, 40, 55]),
  /** The whole hunt is finished. */
  fanfare: () => buzz([16, 45, 16, 45, 16, 45, 90]),
}
