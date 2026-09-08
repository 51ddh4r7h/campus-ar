/**
 * The hunt clock. Derived from the server's timestamps, so it survives reloads
 * and backgrounding, and reads the same as the score the server will compute.
 * Ticks the display ~4×/s.
 */

import {HUNT_LIMIT_MS, elapsedMsOf, remainingMsOf} from '@cmh/shared'
import {game} from './game.svelte'

class Clock {
  now = $state(Date.now())

  constructor() {
    const tick = () => {
      this.now = Date.now()
    }
    setInterval(tick, 250)
    document.addEventListener('visibilitychange', tick)
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
