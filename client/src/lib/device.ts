/**
 * Which kind of phone this is, in one of three words.
 *
 * Sent once at sign-in so the organisers can answer one question: which
 * platform should we test on next time. That is the whole purpose, so the
 * whole user-agent string is never sent — it is a fingerprint, and a
 * fingerprint is a liability we would be keeping for no reason.
 *
 * iPadOS reports itself as a Mac, so the touch check catches it. Anything
 * unrecognised is `other` rather than a guess.
 */
import type {DeviceKind} from '@cmh/shared'

export function deviceKind(): DeviceKind {
  const ua = navigator.userAgent
  if (/android/i.test(ua)) return 'android'
  if (/iphone|ipod|ipad/i.test(ua)) return 'ios'
  // An iPad on recent iPadOS claims to be a Mac; a Mac has no touch points.
  if (/macintosh/i.test(ua) && navigator.maxTouchPoints > 1) return 'ios'
  return 'other'
}
