/**
 * The AR stage — three.js, loaded lazily. A transparent renderer over the live
 * camera <video>; a PerspectiveCamera driven by device orientation (3DoF); a
 * gently-curved cinemascope that plays the reveal clip, anchored in the world
 * by compass heading. Recenter snaps it back in front of you.
 *
 * 6DoF (walk-around) is a later add: swap the orientation-only pose for an
 * 8th Wall pose source; the screen + spill code is unchanged.
 */

import type * as THREE_NS from 'three'

export interface ArStage {
  /**
   * Bring the screen up. `assemble` hands the entry animation over to
   * `setBuild()` instead of running it on a timer — used at arrival, where the
   * anti-cheat dwell drives the screen constructing itself.
   */
  showScreen(opts?: {assemble?: boolean}): void
  hideScreen(): void
  recenter(): void
  /** Assembly progress, 0-1. Only meaningful after showScreen({assemble: true}). */
  setBuild(p: number): void
  setMuted(muted: boolean): void
  /** Brighten the warm spill as the player closes in (heat 0-100). */
  setHeat(heat: number): void
  /** Debug: frames rendered / current screen opacity. */
  stats(): string
  dispose(): void
}

const clamp01 = (n: number): number => (n < 0 ? 0 : n > 1 ? 1 : n)
/** Progress of `p` through the window [a, b], clamped. */
const phase = (p: number, a: number, b: number): number => clamp01((p - a) / (b - a))

/**
 * The screen is 2.39:1 cinemascope, `width` metres across, sitting slightly
 * below eye level. Its distance is not fixed: `fit()` derives it from the live
 * field of view so the screen always fills `FILL` of the frame's width, on any
 * phone, in any orientation.
 */
const SCREEN = {width: 3.0, height: 1.26, y: -0.35, sag: 0.4}

/** Typical phone rear-camera horizontal field of view. */
const CAMERA_HFOV_DEG = 66
/** Fraction of the frame's width the screen should occupy. */
const FILL = 0.62

export async function createArStage(
  canvas: HTMLCanvasElement,
  video: HTMLVideoElement,
  posterUrl?: string,
): Promise<ArStage> {
  const THREE = await import('three')

  const renderer = new THREE.WebGLRenderer({canvas, alpha: true, antialias: true})
  renderer.setClearAlpha(0)
  const scene = new THREE.Scene()
  const camera = new THREE.PerspectiveCamera(70, 1, 0.05, 100)
  const deg2rad = Math.PI / 180

  /** Distance at which the screen fills FILL of the frame width. Set by fit(). */
  let distance = 4

  const resize = () => {
    const w = window.innerWidth
    const h = window.innerHeight
    renderer.setPixelRatio(Math.min(2, window.devicePixelRatio))
    // updateStyle must stay on. A <canvas> is a replaced element: with only
    // `inset: 0` and no CSS width/height it lays out at its *intrinsic* size —
    // the backing-store size, which is viewport x devicePixelRatio. That
    // rendered the whole scene at 2-3x, pushed off the bottom-right corner.
    renderer.setSize(w, h)
    camera.aspect = w / h

    // three's `fov` is vertical; we want to match the phone camera's *horizontal*
    // view, which on a portrait screen means a very tall vertical fov. Deriving
    // it keeps our screen the same apparent size as the real world behind it.
    const halfH = Math.tan((CAMERA_HFOV_DEG * deg2rad) / 2)
    camera.fov = (2 * Math.atan(halfH / camera.aspect)) / deg2rad
    camera.updateProjectionMatrix()

    distance = SCREEN.width / (FILL * 2 * halfH)
    fit()
  }
  window.addEventListener('resize', resize)

  // ---- the anchored group (heading-locked) -------------------------------
  const anchor = new THREE.Group()
  scene.add(anchor)

  const geo = curvedGeometry(THREE, SCREEN.width, SCREEN.height, SCREEN.sag)
  const videoTex = new THREE.VideoTexture(video)
  videoTex.colorSpace = THREE.SRGBColorSpace
  const posterTex = posterUrl ? new THREE.TextureLoader().load(posterUrl) : null
  if (posterTex) posterTex.colorSpace = THREE.SRGBColorSpace
  // depthTest off throughout: the scene is a single flat composition drawn over
  // the camera feed, and the frame sits only 4cm behind the screen — close
  // enough that depth testing z-fights and makes the picture strobe.
  const screenMat = new THREE.MeshBasicMaterial({
    map: posterTex ?? videoTex,
    transparent: true,
    opacity: 0,
    toneMapped: false,
    depthTest: false,
    depthWrite: false,
  })

  // Keep the clip playing (browsers pause an off-screen <video>) and switch the
  // screen from poster → live video once it's actually running.
  let onVideo = !posterTex
  const keepPlaying = () => {
    if (video.error) return
    if (video.paused) void video.play().catch(() => {})
    if (!onVideo && !video.paused && video.currentTime > 0 && video.readyState >= 2) {
      screenMat.map = videoTex
      screenMat.needsUpdate = true
      onVideo = true
    }
  }
  const playPoll = setInterval(keepPlaying, 500)
  const screen = new THREE.Mesh(geo, screenMat)
  screen.renderOrder = 3
  anchor.add(screen)

  // Dark panel behind the picture. During assembly this fills in after the
  // frame and before the image, so the screen reads as being built.
  const backMat = new THREE.MeshBasicMaterial({
    color: 0x05060a,
    transparent: true,
    opacity: 0,
    depthTest: false,
    depthWrite: false,
  })
  const back = new THREE.Mesh(geo, backMat)
  back.renderOrder = 2
  anchor.add(back)

  // thin bright frame
  const frameMat = new THREE.MeshBasicMaterial({
    color: 0xf5f3ec,
    transparent: true,
    opacity: 0,
    depthTest: false,
    depthWrite: false,
  })
  const frame = new THREE.Mesh(
    curvedGeometry(THREE, SCREEN.width + 0.06, SCREEN.height + 0.06, SCREEN.sag),
    frameMat,
  )
  frame.renderOrder = 1
  anchor.add(frame)

  // warm spill on the ground in front of the screen
  const spillMat = new THREE.MeshBasicMaterial({
    color: 0xe8a54c,
    transparent: true,
    opacity: 0,
    blending: THREE.AdditiveBlending,
    depthTest: false,
    depthWrite: false,
  })
  const spill = new THREE.Mesh(new THREE.CircleGeometry(3.4, 40), spillMat)
  spill.rotation.x = -Math.PI / 2
  spill.renderOrder = 0
  anchor.add(spill)

  const light = new THREE.PointLight(0xffd9a8, 0, 12)
  anchor.add(light)

  /** Re-place everything for the current `distance`. */
  function fit(): void {
    screen.position.set(0, SCREEN.y, -distance)
    back.position.set(0, SCREEN.y, -distance - 0.02)
    frame.position.set(0, SCREEN.y, -distance - 0.04)
    spill.position.set(0, SCREEN.y - 1.15, -distance + 0.6)
    light.position.set(0, SCREEN.y, -distance + 1.5)
  }
  resize()

  // ---- device orientation → camera quaternion ---------------------------
  const zee = new THREE.Vector3(0, 0, 1)
  const euler = new THREE.Euler()
  const q0 = new THREE.Quaternion()
  const qMinusHalfPiX = new THREE.Quaternion(-Math.SQRT1_2, 0, 0, Math.SQRT1_2)
  let orient = {alpha: 0, beta: 0, gamma: 0}
  let headingOffset = 0
  let haveReading = false

  const onOrient = (raw: Event) => {
    const e = raw as DeviceOrientationEvent
    if (e.alpha === null && e.beta === null && e.gamma === null) return
    orient = {alpha: e.alpha ?? 0, beta: e.beta ?? 0, gamma: e.gamma ?? 0}
    haveReading = true
  }
  window.addEventListener('deviceorientation', onOrient, true)
  window.addEventListener('deviceorientationabsolute', onOrient, true)

  const screenAngle = (): number => {
    const so = window.screen.orientation
    return so ? so.angle : (window.orientation as number | undefined) ?? 0
  }

  const applyPose = () => {
    const alpha = orient.alpha * deg2rad
    const beta = orient.beta * deg2rad
    const gamma = orient.gamma * deg2rad
    euler.set(beta, alpha, -gamma, 'YXZ')
    camera.quaternion.setFromEuler(euler)
    camera.quaternion.multiply(qMinusHalfPiX)
    camera.quaternion.multiply(q0.setFromAxisAngle(zee, -screenAngle() * deg2rad))
    anchor.rotation.y = headingOffset
  }

  // Point the anchor at wherever the camera is looking *right now*, flattened to
  // the horizon. Placing the screen along the camera's real forward vector — not
  // a hand-rolled compass formula — means it is always dead-centre when it
  // appears, whatever the orientation-event conventions of this device.
  const fwd = new THREE.Vector3()
  const faceForward = () => {
    if (haveReading) applyPose()
    camera.getWorldDirection(fwd)
    fwd.y = 0
    if (fwd.lengthSq() < 1e-4) fwd.set(0, 0, -1)
    fwd.normalize()
    headingOffset = Math.atan2(-fwd.x, -fwd.z)
    anchor.rotation.y = headingOffset
  }

  // ---- show / hide / recenter -----------------------------------------
  let visible = false
  let shownAt = 0
  /**
   * Anchoring needs a real pose. showScreen() usually runs a few milliseconds
   * after the listeners are attached — before the first orientation event — so
   * we defer the capture to the first frame that actually has a reading.
   * Without this the screen anchors to yaw 0 and ends up behind the player,
   * and only a manual Recentre brings it into view.
   */
  let needsAnchor = false
  /** When true, entry progress comes from setBuild() rather than the clock. */
  let assembling = false
  let buildP = 0
  let heatK = 1

  const stage: ArStage = {
    showScreen(opts) {
      visible = true
      shownAt = performance.now()
      needsAnchor = true
      assembling = opts?.assemble ?? false
      faceForward()
      void video.play().catch(() => {})
    },
    hideScreen() {
      visible = false
    },
    recenter() {
      needsAnchor = false
      shownAt = Math.min(shownAt, performance.now() - 700)
      faceForward()
    },
    setBuild(p) {
      buildP = clamp01(p)
    },
    setMuted(m) {
      video.muted = m
    },
    setHeat(heat: number) {
      heatK = clamp01(heat / 100)
    },
    stats() {
      return `f=${frames} op=${screenMat.opacity.toFixed(2)} vis=${visible} read=${haveReading} yaw=${((headingOffset * 180) / Math.PI).toFixed(0)} gl=${renderer.getContext().isContextLost() ? 'LOST' : 'ok'}`
    },
    dispose() {
      running = false
      clearInterval(playPoll)
      window.removeEventListener('resize', resize)
      window.removeEventListener('deviceorientation', onOrient, true)
      window.removeEventListener('deviceorientationabsolute', onOrient, true)
      geo.dispose()
      screenMat.dispose()
      backMat.dispose()
      frameMat.dispose()
      spillMat.dispose()
      videoTex.dispose()
      posterTex?.dispose()
      renderer.dispose()
    },
  }

  // ---- render loop ----------------------------------------------------
  let running = true
  let frames = 0
  const tick = () => {
    if (!running) return
    requestAnimationFrame(tick)
    frames++

    // The first real reading is also the first chance to anchor correctly.
    if (needsAnchor && haveReading) {
      needsAnchor = false
      shownAt = performance.now()
      faceForward()
    }
    if (haveReading) applyPose()

    // Entry progress: either the 700ms ease, or the externally-driven assembly.
    let p = 0
    if (visible) {
      if (assembling) p = buildP
      else {
        const t = Math.min(1, (performance.now() - shownAt) / 700)
        p = t * t * (3 - 2 * t)
      }
    }

    // The screen builds outward-in: frame edges, then the dark panel, then the
    // picture. Off the assembly path all three windows overlap into one fade.
    frameMat.opacity = (assembling ? phase(p, 0, 0.3) : p) * 0.9
    backMat.opacity = (assembling ? phase(p, 0.18, 0.58) : p) * 0.88
    screenMat.opacity = assembling ? phase(p, 0.5, 1) : p

    light.intensity = (0.4 + heatK * 2.2) * p
    spillMat.opacity = (0.14 + heatK * 0.22) * p

    const s = 0.96 + p * 0.04
    screen.scale.setScalar(s)
    back.scale.copy(screen.scale)
    frame.scale.copy(screen.scale)

    renderer.render(scene, camera)
  }
  tick()

  return stage
}

function curvedGeometry(
  THREE: typeof THREE_NS,
  w: number,
  h: number,
  sag: number,
): THREE_NS.BufferGeometry {
  const geo = new THREE.PlaneGeometry(w, h, 40, 1)
  const pos = geo.getAttribute('position')
  for (let i = 0; i < pos.count; i++) {
    const nx = pos.getX(i) / (w / 2)
    pos.setZ(i, -sag * (nx * nx * (0.7 + 0.3 * Math.abs(nx))))
  }
  pos.needsUpdate = true
  geo.computeVertexNormals()
  return geo
}
