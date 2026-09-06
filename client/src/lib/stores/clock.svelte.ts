/**
 * The hunt clock. Derived from the server's timestamps, so it survives reloads
 * and backgrounding, and reads the same as the score the server will compute.
 * Ticks the display ~4×/s.
 */

import {elapsedMsOf} from '@cmh/shared'
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
}

export const clock = new Clock()
