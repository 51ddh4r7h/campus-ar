/**
 * Full-window canvas pipeline module.
 *
 * Ported from the official 8th Wall example stack (XRExtras.FullWindowCanvas,
 * https://github.com/8thwall/8thwall/blob/main/packages/xrextras/src/fullwindowcanvasmodule/full-window-canvas-module.ts)
 * but written as a self-contained module so we don't need the XRExtras script.
 *
 * Without this module the camera canvas keeps its intrinsic video resolution and
 * renders as a small rectangle in the corner of the phone instead of filling the
 * whole viewport.
 */
import type {Xr8CameraPipelineModule} from './types/xr8'
import {isCameraStatusDetail} from './camera-status'

/** Creates a camera pipeline module that keeps the canvas covering the whole window. */

/** Body style fields this module stashes before overriding and restores on detach. */
interface BodyStylePair {
  backgroundColor: string
  overflowY: string
}

export const fullWindowCanvasModule = (): Xr8CameraPipelineModule => {
  let canvas: HTMLCanvasElement | null = null

  const videoSize = {w: 0, h: 0}
  let orientation = 0

  const originalBodyStyle: BodyStylePair = {
    backgroundColor: 'initial',
    overflowY: 'initial',
  }
  const originalHtmlOverflow = 'initial'

  const canvasStyle: Partial<CSSStyleDeclaration> = {
    width: '100%',
    height: '100%',
    margin: '0px',
    padding: '0px',
    border: '0px',
    display: 'block',
  }

  const bodyStyle: Partial<CSSStyleDeclaration> = {
    width: '100%',
    height: '100%',
    margin: '0px',
    padding: '0px',
    border: '0px',
    overflowY: 'initial',
    backgroundColor: 'initial',
  }

  const isCompatibleMobile = (): boolean =>
    XR8.XrDevice.isDeviceBrowserCompatible({allowedDevices: XR8.XrConfig.device().MOBILE}) &&
    !XR8.XrDevice.deviceEstimate().model.toLowerCase().includes('ipad')

  /** Sizes the canvas (both CSS box and backing store) to fill the window. */
  const fillScreenWithCanvas = (): void => {
    if (!canvas) return

    // Window size in device pixels.
    const uww = window.innerWidth
    const uwh = window.innerHeight
    const ww = uww * devicePixelRatio
    const wh = uwh * devicePixelRatio

    // On mobile, wait for an in-flight orientation change to settle before resizing.
    const mismatch =
      ((orientation === 0 || orientation === 180) && ww > wh) ||
      ((orientation === 90 || orientation === -90) && wh > ww)
    if (mismatch && isCompatibleMobile()) {
      window.requestAnimationFrame(fillScreenWithCanvas)
      return
    }

    // Portrait aspect ratio of the window.
    const ph = Math.max(ww, wh)
    const pw = Math.min(ww, wh)
    const pa = ph / pw

    // Portrait dimensions of the camera video (cropped to fill the window).
    const pvh = Math.max(videoSize.w, videoSize.h)
    const pvw = Math.min(videoSize.w, videoSize.h)
    let ch = pvh
    let cw = Math.round(pvh / pa)
    if (cw > pvw) {
      cw = pvw
      ch = Math.round(pvw * pa)
    }

    // If the video has more pixels than the screen, use the screen resolution.
    if (cw > pw || ch > ph) {
      cw = pw
      ch = ph
    }

    // Back to landscape orientation if the window is landscape.
    if (ww > wh) {
      const tmp = cw
      cw = ch
      ch = tmp
    }

    Object.assign(canvas.style, canvasStyle)
    canvas.width = cw
    canvas.height = ch

    // On iOS, rotating portrait→landscape→portrait can leave the address bar hiding
    // content; nudge the scroll position (no-op on Chrome / Android).
    setTimeout(() => window.scrollTo(0, (window.scrollY + 1) % 2), 300)
  }

  const onWindowResize = (): void => {
    if (isCompatibleMobile()) return // orientation-change flow handles mobile
    fillScreenWithCanvas()
  }

  return {
    name: 'fullwindowcanvas',

    onAttach: ({canvas: c, orientation: o, videoWidth, videoHeight}) => {
      canvas = c
      orientation = o

      if (XR8.XrDevice.deviceEstimate().os === 'iOS') {
        const computedBodyStyle = getComputedStyle(document.body)
        originalBodyStyle.backgroundColor = computedBodyStyle.getPropertyValue('background-color')
        originalBodyStyle.overflowY = computedBodyStyle.getPropertyValue('overflow-y')
        document.documentElement.style.overflow = 'hidden' // prevent address bar hiding on scroll

        bodyStyle.backgroundColor = window.matchMedia?.('(prefers-color-scheme: dark)').matches
          ? 'black'
          : 'white'
        bodyStyle.overflowY = 'scroll'
      }
      Object.assign(document.body.style, bodyStyle)

      document.body.appendChild(c)
      window.addEventListener('resize', onWindowResize)
      videoSize.w = videoWidth
      videoSize.h = videoHeight
      fillScreenWithCanvas()
    },

    onDetach: () => {
      document.body.style.backgroundColor = originalBodyStyle.backgroundColor
      document.body.style.overflowY = originalBodyStyle.overflowY
      document.documentElement.style.overflow = originalHtmlOverflow
      canvas = null
      orientation = 0
      window.removeEventListener('resize', onWindowResize)
    },

    onCameraStatusChange: (payload) => {
      if (!isCameraStatusDetail(payload) || payload.status !== 'hasVideo') return
      const video = payload.video
      if (video?.videoWidth && video?.videoHeight) {
        videoSize.w = video.videoWidth
        videoSize.h = video.videoHeight
      }
    },

    onVideoSizeChange: ({videoWidth, videoHeight}) => {
      videoSize.w = videoWidth
      videoSize.h = videoHeight
      fillScreenWithCanvas()
    },

    onDeviceOrientationChange: ({orientation: o}) => {
      const prev = orientation
      orientation = o
      fillScreenWithCanvas()
      // Notify the app layer that the physical device rotated — the Three camera
      // and world anchors need to re-sync or they'll read 90° off (the bug in the screenshot).
      if (prev !== o) {
        window.dispatchEvent(
          new CustomEvent('campus-ar:orientation', {
            detail: {orientation: o, prev},
          }),
        )
      }
    },

    onCanvasSizeChange: () => fillScreenWithCanvas(),

    onUpdate: () => {
      if (canvas?.style.width === canvasStyle.width && canvas?.style.height === canvasStyle.height) {
        return
      }
      fillScreenWithCanvas()
    },
  }
}