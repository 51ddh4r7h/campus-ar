/**
 * The hunt clock. Wall-clock based off the server start timestamp, so it
 * survives reloads and backgrounding. Ticks the display ~4×/s.
 */

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

  get elapsedMs(): number {
    const start = game.session?.startTsMs
    if (!start) return 0
    const end = game.session?.endTsMs ?? this.now
    return Math.max(0, end - start)
  }
}

export const clock = new Clock()
