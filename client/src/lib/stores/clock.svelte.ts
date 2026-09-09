/**
 * The hunt clock. Derived from the server's timestamps, so it survives reloads
 * and backgrounding, and reads the same as the score the server will compute.
 * Ticks the display ~4×/s.
 */

import {HUNT_LIMIT_MS, elapsedMsOf, remainingMsOf} from '@cmh/shared'
import {game} from './game.svelte'

/**
 * A gap between ticks longer than this means the tab was not running — a phone
 * browser froze it in the background rather than unloading it. Well clear of
 * the 250ms interval and of any ordinary jank.
 */
const SUSPEND_GAP_MS = 30_000

class Clock {
  now = $state(Date.now())

  /**
   * The tab has just come back from being frozen, and nothing has confirmed the
   * session since.
   *
   * A restored tab has every value it had before the freeze, including a
   * session snapshot, but its clock jumps to now. Anything that would end a
   * hunt on screen has to wait for a fresh read rather than compare a live
   * clock against a stale session — that mismatch is what sent players to the
   * wrap screen on a hunt that was still running.
   */
  suspended = $state(false)

  private lastTickMs = Date.now()

  constructor() {
    const tick = () => {
      const t = Date.now()
      if (t - this.lastTickMs > SUSPEND_GAP_MS) this.suspended = true
      this.lastTickMs = t
      this.now = t
    }
    setInterval(tick, 250)
    document.addEventListener('visibilitychange', tick)
  }

  /** Called once the session has been re-read from the server. */
  synced(): void {
    this.suspended = false
  }

  /** Shared with the engine, so a paused clock reads the same on both sides. */
  get elapsedMs(): number {
    const s = game.session
    return s ? elapsedMsOf(s, this.now) : 0
  }

  /**
   * What the player is shown: time left, not time spent.
   *
   * Derived from the same elapsed figure the server scores with, so the number
   * on screen and the deadline the server enforces cannot drift apart. Floors
   * at zero rather than going negative — the server ends the hunt there.
   */
  get remainingMs(): number {
    const s = game.session
    return s ? remainingMsOf(s, this.now) : HUNT_LIMIT_MS
  }

  /** The last five minutes, where the number stops being background. */
  get lowOnTime(): boolean {
    return game.inProgress && this.remainingMs <= 5 * 60_000
  }
}

export const clock = new Clock()
