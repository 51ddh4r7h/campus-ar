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
