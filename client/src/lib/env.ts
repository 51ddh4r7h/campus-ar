/** Environment sniffing — just enough to warn about in-app browsers. */

const UA = typeof navigator !== 'undefined' ? navigator.userAgent : ''

/**
 * Instagram / Facebook / Snapchat / LinkedIn / etc. in-app webviews often block
 * camera and motion sensors. Detect the common ones so we can nudge the player
 * to open the link in Safari or Chrome.
 */
export const isInAppBrowser = (ua: string = UA): boolean =>
  /\b(Instagram|FBAN|FBAV|FB_IAB|Snapchat|Line\/|Twitter|LinkedInApp|Pinterest|MicroMessenger)\b/i.test(
    ua,
  )

export const isSecureContext = (): boolean =>
  typeof window === 'undefined' || window.isSecureContext
