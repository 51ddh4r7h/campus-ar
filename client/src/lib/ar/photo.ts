/**
 * Photo mode.
 *
 * The one thing here that leaves the app. A player standing in the place a
 * scene was shot, with that scene playing on a screen hanging in the air in
 * front of them, is the artefact worth keeping — and the one that will do more
 * for next year's intake than any amount of describing it.
 *
 * Compositing is manual because the two halves live in different places: the
 * camera feed is a <video> the browser paints, and the scene is a WebGL canvas
 * drawn over it. Neither knows about the other, so the capture stacks them in
 * the order the eye sees them and adds the caption on top.
 */

/** Longest edge of a saved frame. Enough to look good, small enough to share. */
const MAX_EDGE = 1440

export interface Shot {
  dataUrl: string
  blob: Blob | null
}

/**
 * Stack the camera feed and the rendered scene into one image.
 * `sceneDataUrl` comes from the stage, which must render and read in the same
 * tick — see ArStage.capture.
 */
export async function composeShot(
  video: HTMLVideoElement | null,
  sceneDataUrl: string | null,
  caption?: {title: string; place: string},
): Promise<Shot | null> {
  if (!sceneDataUrl) return null

  const scene = await loadImage(sceneDataUrl)
  if (!scene) return null

  // The scene canvas is the reference frame: it already matches the viewport.
  const scale = Math.min(1, MAX_EDGE / Math.max(scene.width, scene.height))
  const w = Math.round(scene.width * scale)
  const h = Math.round(scene.height * scale)

  const out = document.createElement('canvas')
  out.width = w
  out.height = h
  const g = out.getContext('2d')
  if (!g) return null

  g.fillStyle = '#05060a'
  g.fillRect(0, 0, w, h)
  if (video && video.readyState >= 2) drawCover(g, video, w, h)
  g.drawImage(scene, 0, 0, w, h)
  if (caption) drawCaption(g, w, h, caption)

  return {
    dataUrl: out.toDataURL('image/jpeg', 0.92),
    blob: await toBlob(out),
  }
}

/** Draw `src` filling the frame without distorting it — CSS object-fit: cover. */
function drawCover(
  g: CanvasRenderingContext2D,
  src: HTMLVideoElement,
  w: number,
  h: number,
): void {
  const sw = src.videoWidth
  const sh = src.videoHeight
  if (!sw || !sh) return
  const k = Math.max(w / sw, h / sh)
  const dw = sw * k
  const dh = sh * k
  g.drawImage(src, (w - dw) / 2, (h - dh) / 2, dw, dh)
}

function drawCaption(
  g: CanvasRenderingContext2D,
  w: number,
  h: number,
  caption: {title: string; place: string},
): void {
  const pad = Math.round(w * 0.045)
  const base = h - pad

  const shade = g.createLinearGradient(0, h - pad * 4.5, 0, h)
  shade.addColorStop(0, 'rgba(0,0,0,0)')
  shade.addColorStop(1, 'rgba(0,0,0,0.72)')
  g.fillStyle = shade
  g.fillRect(0, h - pad * 4.5, w, pad * 4.5)

  g.fillStyle = 'rgba(232,165,76,0.95)'
  g.font = `500 ${Math.round(w * 0.026)}px ui-monospace, "SF Mono", Menlo, monospace`
  g.fillText(caption.place.toUpperCase(), pad, base - Math.round(w * 0.052))

  g.fillStyle = '#f5f3ec'
  g.font = `500 ${Math.round(w * 0.052)}px "Instrument Serif", Georgia, serif`
  g.fillText(caption.title, pad, base)
}

function loadImage(src: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => resolve(null)
    img.src = src
  })
}

function toBlob(canvas: HTMLCanvasElement): Promise<Blob | null> {
  return new Promise((resolve) => {
    canvas.toBlob((b) => resolve(b), 'image/jpeg', 0.92)
  })
}

/**
 * Hand the shot to the player.
 *
 * The share sheet is the right route on a phone — it reaches the camera roll,
 * WhatsApp and Instagram in one step, which a download link does not. Where
 * that is unavailable we fall back to a download, and where that is blocked
 * too the caller shows the image for a long-press save.
 */
export async function offerShot(shot: Shot, filename: string): Promise<'shared' | 'saved' | 'shown'> {
  const file = shot.blob ? new File([shot.blob], filename, {type: 'image/jpeg'}) : null

  if (file && navigator.canShare?.({files: [file]})) {
    try {
      await navigator.share({files: [file]})
      return 'shared'
    } catch {
      // Cancelled or refused — fall through to saving.
    }
  }

  try {
    const a = document.createElement('a')
    a.href = shot.dataUrl
    a.download = filename
    a.click()
    return 'saved'
  } catch {
    return 'shown'
  }
}
