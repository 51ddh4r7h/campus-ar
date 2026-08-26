/**
 * Haptics — thin wrapper over the Vibration API with feature detection.
 *
 * Android Chrome vibrates for real. iOS Safari does not expose the web
 * vibration API at all (Apple limitation) — there `supported()` is false and
 * every call is a silent no-op, so callers never branch on platform.
 */

type Pattern = number | number[]

const buzz = (pattern: Pattern): boolean => {
  if (typeof navigator === 'undefined' || typeof navigator.vibrate !== 'function') return false
  return navigator.vibrate(pattern)
}

export const haptics = {
  /** True when the device can actually vibrate (Android browsers). */
  supported: (): boolean => typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function',

  /** UI tap — button presses, band crossings. */
  tick: (): boolean => buzz(9),

  /** Set went live — you can open the camera. */
  unlock: (): boolean => buzz([14, 70, 14]),

  /** Clapperboard strike — the reveal moment. */
  clap: (): boolean => buzz([45, 30, 95]),

  /** All sets found — wrap fanfare. */
  fanfare: (): boolean => buzz([16, 45, 16, 45, 70]),
}
