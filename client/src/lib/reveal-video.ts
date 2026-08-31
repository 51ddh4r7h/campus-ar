/**
 * One shared <video> for the scene clip, reused across the whole session.
 *
 * It plays twice per level: silently on the AR screen at the start (the clue),
 * and again with sound at the location (the reward). Keeping a single element
 * matters for mobile autoplay — once the player's first tap unblocks it, every
 * later play is allowed without another gesture.
 */

let el: HTMLVideoElement | null = null

export function revealVideo(): HTMLVideoElement {
  if (!el) {
    el = document.createElement('video')
    el.playsInline = true
    el.loop = true
    el.crossOrigin = 'anonymous'
    el.preload = 'auto'
    el.setAttribute('webkit-playsinline', 'true')
    el.style.cssText =
      'position:fixed;right:0;bottom:0;width:2px;height:2px;opacity:0;pointer-events:none;z-index:-1'
    document.body.appendChild(el)
  }
  return el
}

/**
 * Unblock playback from inside a user gesture. Called on the tap that starts a
 * level, which buys autoplay for the rest of the session.
 */
export function primeReveal(clipUrl: string): void {
  const v = revealVideo()
  if (v.getAttribute('src') !== clipUrl) {
    v.src = clipUrl
    v.load()
  }
  v.muted = true
  v.play().catch(() => {})
}

export function disposeRevealVideo(): void {
  if (!el) return
  el.pause()
  el.removeAttribute('src')
  el.load()
  el.remove()
  el = null
}
