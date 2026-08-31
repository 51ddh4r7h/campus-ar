/**
 * One shared <video> for the reveal clip. Created and primed on the "Reveal the
 * scene" tap (a real user gesture) so mobile browsers let it play — then the
 * Reveal screen and the AR stage both consume the same element.
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

/** Call synchronously from the reveal button's click handler. */
export function primeReveal(clipUrl: string): void {
  const v = revealVideo()
  if (v.getAttribute('src') !== clipUrl) {
    v.src = clipUrl
    v.load()
  }
  v.currentTime = 0
  v.muted = false
  v.play().catch(() => {
    // Sound-on autoplay refused — try muted so at least the picture moves.
    v.muted = true
    v.play().catch(() => {})
  })
}

export function disposeRevealVideo(): void {
  if (!el) return
  el.pause()
  el.removeAttribute('src')
  el.load()
  el.remove()
  el = null
}
