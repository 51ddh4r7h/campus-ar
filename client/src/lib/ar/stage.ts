/**
 * The AR stage — three.js, loaded lazily. A transparent renderer over the live
 * camera <video>; a PerspectiveCamera driven by device orientation (3DoF); a
 * gently-curved cinemascope that plays the reveal clip, anchored in the world
 * by compass heading. Recenter snaps it back in front of you.
 *
 * 6DoF (walk-around) is a later add: swap the orientation-only pose for an
 * 8th Wall pose source; the screen and bloom code is unchanged.
 */

import type * as THREE_NS from 'three'
import {createProjector} from './projector'
import {createTitleCard, type TitleCard} from './title-card'
import {createArSound} from './sound'
import {disposeProp, loadProp, type PropName} from './models'
import {createLighting, type Lighting} from './lighting'

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
  /**
   * The reveal beat. The frame the player was hunting is held on the screen,
   * the projector strikes its lamp and gets its reels turning, and only then
   * does the still dissolve into the moving scene.
   */
  playScene(): void
  /**
   * A single composited frame — the camera's view with the scene drawn over
   * it — as a data URL, or null if the buffer could not be read.
   */
  capture(): string | null
  /** Brighten the bloom as the player closes in (heat 0-100). */
  setHeat(heat: number): void
  /** Debug: frames rendered / current screen opacity. */
  stats(): string
  dispose(): void
}

const clamp01 = (n: number): number => (n < 0 ? 0 : n > 1 ? 1 : n)

/** Heading of a quaternion about the world Y axis, in radians. */
const yawOf = (q: THREE_NS.Quaternion): number =>
  Math.atan2(2 * (q.w * q.y + q.x * q.z), 1 - 2 * (q.y * q.y + q.x * q.x))
/** Progress of `p` through the window [a, b], clamped. */
const phase = (p: number, a: number, b: number): number => clamp01((p - a) / (b - a))

/**
 * The screen is 2.39:1 cinemascope, `width` metres across, sitting slightly
 * below eye level. Its distance is not fixed: `fit()` derives it from the live
 * field of view so the screen always fills `FILL` of the frame's width, on any
 * phone, in any orientation.
 */
const SCREEN = {width: 3.0, height: 1.26, y: -0.12}

/**
 * Curvature, as a multiple of the screen width. A real cinemascope screen is a
 * shallow cylinder section that wraps *towards* the audience; 1.8x width is
 * about a 16-degree wrap, which reads as curved without distorting the image.
 */
const CURVE_RADIUS = 1.8

/**
 * How far the downloaded projector model must be turned to face its lens the
 * same way the hand-built one does. Set by looking at it; a model carries no
 * convention about which way is forward.
 */
const MODEL_FACE_OFFSET_Y = -Math.PI / 2

/** Typical phone rear-camera horizontal field of view. */
const CAMERA_HFOV_DEG = 66
/** Fraction of the frame's width the screen should occupy. */
const FILL = 0.62

export interface StageContent {
  posterUrl?: string | undefined
  /** Shown on the title card beside the screen. Omit to hide the card. */
  title?: string | undefined
  note?: string | undefined
  /** Slate mark, e.g. "Scene 03". */
  scene?: string | undefined
  /** The frame the player was hunting — held, then dissolved into the clip. */
  stillUrl?: string | undefined
}

export async function createArStage(
  canvas: HTMLCanvasElement,
  video: HTMLVideoElement,
  content: StageContent = {},
): Promise<ArStage> {
  const {posterUrl} = content
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

  const geo = curvedGeometry(THREE, SCREEN.width, SCREEN.height)
  const videoTex = new THREE.VideoTexture(video)
  videoTex.colorSpace = THREE.SRGBColorSpace
  // A VideoTexture re-uploads every frame; building a mip chain each time is
  // wasted work on a phone and shows up as hitching.
  videoTex.generateMipmaps = false
  videoTex.minFilter = THREE.LinearFilter
  const stillSrc = content.stillUrl ?? posterUrl
  const stillTex = stillSrc ? new THREE.TextureLoader().load(stillSrc) : null
  if (stillTex) stillTex.colorSpace = THREE.SRGBColorSpace
  // depthTest off throughout: the scene is a single flat composition drawn over
  // the camera feed, and the frame sits only 4cm behind the screen — close
  // enough that depth testing z-fights and makes the picture strobe.
  const screenMat = new THREE.MeshBasicMaterial({
    map: videoTex,
    transparent: true,
    opacity: 0,
    toneMapped: false,
    depthTest: false,
    depthWrite: false,
  })

  // Browsers pause an off-screen <video>; keep nudging it back.
  const keepPlaying = () => {
    if (video.error) return
    if (video.paused) void video.play().catch(() => {})
  }
  const playPoll = setInterval(keepPlaying, 500)
  const screen = new THREE.Mesh(geo, screenMat)
  screen.renderOrder = 3
  anchor.add(screen)

  // The frame the player was hunting, sitting over the picture until the
  // scene starts. Holding it here is the whole point of the reveal: you spent
  // the walk matching a frozen image, so the reward is that image coming alive
  // in the place it was shot rather than a clip simply beginning.
  const stillMat = new THREE.MeshBasicMaterial({
    map: stillTex,
    transparent: true,
    opacity: 0,
    toneMapped: false,
    depthTest: false,
    depthWrite: false,
  })
  const still = new THREE.Mesh(geo, stillMat)
  still.renderOrder = 4
  anchor.add(still)

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
    curvedGeometry(THREE, SCREEN.width + 0.05, SCREEN.height + 0.05, SCREEN.width),
    frameMat,
  )
  frame.renderOrder = 1
  anchor.add(frame)

  // Warm bloom bleeding off the edges of the picture. This replaced a big
  // additive disc lying on the ground, whose near rim reached the camera and
  // washed the whole lower half of the view orange.
  const glowTex = glowTexture(THREE)
  const glowMat = new THREE.MeshBasicMaterial({
    map: glowTex,
    transparent: true,
    opacity: 0,
    blending: THREE.AdditiveBlending,
    depthTest: false,
    depthWrite: false,
  })
  const glow = new THREE.Mesh(
    new THREE.PlaneGeometry(SCREEN.width * 1.7, SCREEN.height * 2.6),
    glowMat,
  )
  glow.renderOrder = 0
  anchor.add(glow)

  /** Re-place everything for the current `distance`. */
  function fit(): void {
    screen.position.set(0, SCREEN.y, -distance)
    still.position.set(0, SCREEN.y, -distance + 0.005)
    back.position.set(0, SCREEN.y, -distance - 0.02)
    frame.position.set(0, SCREEN.y, -distance - 0.04)
    glow.position.set(0, SCREEN.y, -distance - 0.12)
  }
  resize()

  // ---- the projector, and the caption beside the screen -----------------
  // Stood between the viewer and the screen, off to the left and near enough
  // to stay inside a portrait frame, aimed at the middle of the picture. You
  // see machine, beam and screen in one look — which a projector behind your
  // head, however accurate, could never give you.
  const projector = createProjector(THREE, {
    at: [-0.86, SCREEN.y - 0.46, -distance * 0.62],
    aim: [0, SCREEN.y, -distance],
    mouthRadius: SCREEN.height * 0.62,
  })
  anchor.add(projector.group)

  // The projector is lit by the picture itself — see ./lighting.
  let lighting: Lighting | null = null
  void createLighting(THREE, {
    width: SCREEN.width,
    height: SCREEN.height,
    y: SCREEN.y,
    distance,
  }).then((l) => {
    if (disposed) {
      l.dispose()
      return
    }
    lighting = l
    anchor.add(l.group)
  })

  // Swap in the real projector once it decodes. It never blocks the reveal —
  // a failure just leaves the primitives showing.
  let propRoot: THREE_NS.Object3D | null = null
  // If the model is slow, show the hand-built one rather than an empty stand —
  // but only after waiting, so a normal load never flashes the primitives.
  const fallbackTimer = setTimeout(() => projector.useFallback(), 2500)
  void loadProp(THREE, 'film_projector', 0.62).then((model) => {
    clearTimeout(fallbackTimer)
    if (disposed) return
    if (!model) {
      projector.useFallback()
      return
    }
    propRoot = model
    projector.attachModel(model, {faceOffsetY: MODEL_FACE_OFFSET_Y, lampY: 0.17})
  })

  // The clip's own audio, placed at the screen, plus the projector's noise.
  const sound = createArSound(video, {x: 0, z: -distance})

  // ---- set dressing ----------------------------------------------------
  // Props that only have to be there. They fade with the rest of the scene and
  // each one is allowed to never arrive.
  const dressingMats: THREE_NS.Material[] = []
  const dressingRoots: THREE_NS.Object3D[] = []

  const dressWith = async (
    name: PropName,
    sizeM: number,
    place: (o: THREE_NS.Object3D) => void,
  ): Promise<void> => {
    const model = await loadProp(THREE, name, sizeM)
    if (!model || disposed) return
    model.traverse((o) => {
      const mesh = o as THREE_NS.Mesh
      if (!mesh.isMesh) return
      mesh.renderOrder = 6
      for (const m of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) {
        m.transparent = true
        m.depthTest = true
        m.depthWrite = true
        m.opacity = 0
        dressingMats.push(m)
      }
    })
    place(model)
    anchor.add(model)
    dressingRoots.push(model)
  }

  // A spare reel stood on the ground beside the projector.
  void dressWith('film_reel', 0.24, (o) => {
    o.position.set(-0.46, SCREEN.y - 0.68, -distance * 0.58)
    o.rotation.y = 0.55
  })

  // The clapperboard belongs to the reward, not the clue — it turns up only
  // once the scene has been won, propped at the foot of the picture.
  if (content.title) {
    void dressWith('clapperboard', 0.46, (o) => {
      o.position.set(SCREEN.width * 0.5 - 0.32, SCREEN.y - SCREEN.height * 0.5 - 0.4, -distance + 0.55)
      o.rotation.set(-0.1, -0.42, 0.04)
    })
  }

  const card: TitleCard | null = content.title
    ? createTitleCard(THREE, {
        title: content.title,
        note: content.note ?? '',
        scene: content.scene,
      })
    : null
  if (card) {
    // Above the picture's left corner, square to the viewer — a caption is
    // meant to be read, not angled for effect. Above, because the projector
    // stands to the lower left and the two would otherwise overlap.
    card.mesh.position.set(
      -SCREEN.width * 0.5 + 0.82,
      SCREEN.y + SCREEN.height * 0.5 + 0.26,
      -distance + 0.1,
    )
    anchor.add(card.mesh)
  }

  // ---- device orientation → camera quaternion ---------------------------
  const zee = new THREE.Vector3(0, 0, 1)
  const euler = new THREE.Euler()
  const q0 = new THREE.Quaternion()
  const qMinusHalfPiX = new THREE.Quaternion(-Math.SQRT1_2, 0, 0, Math.SQRT1_2)
  /** Where the sensor says we are looking. The camera chases this, it never snaps to it. */
  const targetQ = new THREE.Quaternion()
  let orient = {alpha: 0, beta: 0, gamma: 0}
  let headingOffset = 0
  let haveReading = false

  /**
   * Two orientation events exist and they do NOT share a reference frame:
   * `deviceorientation` is relative to wherever the device happened to start,
   * `deviceorientationabsolute` is referenced to magnetic north. Listening to
   * both feeds alternating frames from two different worlds into one pose,
   * which reads on screen as the picture shaking. Lock onto whichever stream
   * speaks first and ignore the other for the life of the stage.
   */
  let source: string | null = null

  const onOrient = (raw: Event) => {
    const e = raw as DeviceOrientationEvent
    if (e.alpha === null && e.beta === null && e.gamma === null) return
    source ??= raw.type
    if (raw.type !== source) return
    orient = {alpha: e.alpha ?? 0, beta: e.beta ?? 0, gamma: e.gamma ?? 0}
    haveReading = true
  }
  window.addEventListener('deviceorientation', onOrient, true)
  window.addEventListener('deviceorientationabsolute', onOrient, true)

  const screenAngle = (): number => {
    const so = window.screen.orientation
    return so ? so.angle : (window.orientation as number | undefined) ?? 0
  }

  /** The raw sensor pose, before any smoothing. */
  const readPose = (out: THREE_NS.Quaternion): THREE_NS.Quaternion => {
    euler.set(orient.beta * deg2rad, orient.alpha * deg2rad, -orient.gamma * deg2rad, 'YXZ')
    out.setFromEuler(euler)
    out.multiply(qMinusHalfPiX)
    out.multiply(q0.setFromAxisAngle(zee, -screenAngle() * deg2rad))
    return out
  }

  /**
   * Chase the sensor rather than following it exactly.
   *
   * Raw device orientation is noisy, and a phone held up to look at the screen
   * sits near beta 90 degrees — the degenerate angle for a YXZ euler, where
   * yaw and roll trade places and small sensor wobble becomes large rotation.
   * Applying that straight to the camera is what made the picture jitter.
   *
   * So the camera slerps toward the reading with a time constant that adapts:
   * loose and heavily damped while you hold still, tightening as you turn so a
   * deliberate look-around never feels laggy. A jump too large to be a real
   * movement is a reference-frame glitch, and gets taken in one step rather
   * than smeared across half a second.
   */
  const applyPose = (dtMs: number) => {
    readPose(targetQ)
    const delta = camera.quaternion.angleTo(targetQ)

    if (delta > 1.4) {
      camera.quaternion.copy(targetQ)
    } else {
      const tauMs = delta > 0.3 ? 45 : 130
      camera.quaternion.slerp(targetQ, 1 - Math.exp(-dtMs / tauMs))
    }
    anchor.rotation.y = headingOffset
  }

  // Point the anchor at wherever the camera is looking *right now*, flattened to
  // the horizon. Placing the screen along the camera's real forward vector — not
  // a hand-rolled compass formula — means it is always dead-centre when it
  // appears, whatever the orientation-event conventions of this device.
  const fwd = new THREE.Vector3()
  const faceForward = () => {
    // Anchor to the true reading, not the chasing camera, or the screen lands
    // wherever the smoothing happened to be mid-flight.
    if (haveReading) camera.quaternion.copy(readPose(targetQ))
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
  /**
   * Milliseconds since the scene was called for, or -1 before it is. The still
   * is held for HOLD_MS while the projector gets going, then dissolves.
   */
  let sceneMs = -1
  const HOLD_MS = 1400
  const DISSOLVE_MS = 1100
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
      const next = clamp01(p)
      if (buildP < 1 && next >= 1) sound.lock()
      buildP = next
    },
    setMuted(m) {
      video.muted = m
    },

    playScene() {
      if (sceneMs >= 0) return
      sceneMs = 0
      projector.startUp()
      sound.lock()
      video.currentTime = 0
      void video.play().catch(() => {})
    },

    capture() {
      // The drawing buffer is cleared once the frame is composited, so the
      // read has to happen in the same tick as a render — hence rendering
      // here rather than relying on whatever the loop last drew.
      try {
        renderer.render(scene, camera)
        return renderer.domElement.toDataURL('image/png')
      } catch {
        return null
      }
    },
    setHeat(heat: number) {
      heatK = clamp01(heat / 100)
    },
    stats() {
      return `f=${frames} op=${screenMat.opacity.toFixed(2)} vis=${visible} read=${haveReading} yaw=${((headingOffset * 180) / Math.PI).toFixed(0)} gl=${renderer.getContext().isContextLost() ? 'LOST' : 'ok'}`
    },
    dispose() {
      running = false
      disposed = true
      clearInterval(playPoll)
      clearTimeout(fallbackTimer)
      window.removeEventListener('resize', resize)
      window.removeEventListener('deviceorientation', onOrient, true)
      window.removeEventListener('deviceorientationabsolute', onOrient, true)
      geo.dispose()
      screenMat.dispose()
      stillMat.dispose()
      stillTex?.dispose()
      backMat.dispose()
      frameMat.dispose()
      glowMat.dispose()
      glowTex.dispose()
      projector.dispose()
      if (propRoot) disposeProp(propRoot)
      for (const root of dressingRoots) disposeProp(root)
      lighting?.dispose()
      card?.dispose()
      sound.dispose()
      videoTex.dispose()
      renderer.dispose()
    },
  }

  /** Entry progress 0-1: the 700ms ease, or the externally-driven assembly. */
  const entryProgress = (): number => {
    if (!visible) return 0
    if (assembling) return buildP
    const t = Math.min(1, (performance.now() - shownAt) / 700)
    return t * t * (3 - 2 * t)
  }

  /**
   * The screen builds outward-in: frame edges, then the dark panel, then the
   * picture. Off the assembly path all three windows collapse into one fade.
   */
  const applyEntry = (p: number, dissolved: number): void => {
    frameMat.opacity = (assembling ? phase(p, 0, 0.3) : p) * 0.9
    backMat.opacity = (assembling ? phase(p, 0.18, 0.58) : p) * 0.88
    screenMat.opacity = assembling ? phase(p, 0.5, 1) : p
    glowMat.opacity = (0.35 + heatK * 0.4) * p

    screen.scale.setScalar(0.96 + p * 0.04)
    back.scale.copy(screen.scale)
    frame.scale.copy(screen.scale)

    // The held frame belongs to the arrival beat only. On the clue screen
    // there is nothing to pay off, so the clip plays straight away — leaving
    // the still up there froze the picture behind it.
    stillMat.opacity = assembling ? phase(p, 0.5, 1) * (1 - dissolved) : 0

    // The lamp comes up with the picture; the caption arrives last.
    card?.setOpacity(assembling ? phase(p, 0.72, 1) : p)
    const dress = assembling ? phase(p, 0.55, 1) : p
    for (const m of dressingMats) m.opacity = dress
  }

  // ---- render loop ----------------------------------------------------
  let running = true
  let disposed = false
  let frames = 0
  let lastMs = performance.now()
  const tick = () => {
    if (!running) return
    requestAnimationFrame(tick)
    frames++
    const nowMs = performance.now()
    // Clamp: a backgrounded tab resumes with a huge gap, which would snap the
    // smoothing wide open on the first frame back.
    const dtMs = Math.min(64, nowMs - lastMs)
    lastMs = nowMs

    // The first real reading is also the first chance to anchor correctly.
    if (needsAnchor && haveReading) {
      needsAnchor = false
      shownAt = performance.now()
      faceForward()
    }
    if (haveReading) applyPose(dtMs)

    // Hold the hunted frame, then dissolve it into the moving scene.
    if (sceneMs >= 0) sceneMs += dtMs
    const dissolved = sceneMs < 0 ? 0 : clamp01((sceneMs - HOLD_MS) / DISSOLVE_MS)

    const p = entryProgress()
    applyEntry(p, dissolved)
    const lamp = assembling ? phase(p, 0.12, 0.7) : p
    projector.update(dtMs, lamp, !video.paused)
    // The screen's own light rises with the screen.
    lighting?.setLevel(assembling ? phase(p, 0.4, 1) : p)
    sound.setRunning(lamp)
    sound.setListener(-headingOffset + yawOf(camera.quaternion))
    renderer.render(scene, camera)
  }
  tick()

  return stage
}

/**
 * A shallow cylinder section: the ends wrap *towards* the viewer, the way a
 * real cinemascope screen does. Bending each vertex around a true arc (rather
 * than displacing z on a flat grid) keeps the arc length equal to `w`, so the
 * picture stays evenly spaced across the curve instead of stretching at the
 * ends. The extra height segments matter too — a curve interpolated across a
 * single tall quad shears the texture.
 */
function curvedGeometry(
  THREE: typeof THREE_NS,
  w: number,
  h: number,
  /** Curve about this width, so a surround stays concentric with the picture. */
  curveAbout = w,
): THREE_NS.BufferGeometry {
  const geo = new THREE.PlaneGeometry(w, h, 48, 8)
  const radius = curveAbout * CURVE_RADIUS
  const halfAngle = w / (2 * radius)
  const pos = geo.getAttribute('position')
  for (let i = 0; i < pos.count; i++) {
    const theta = (pos.getX(i) / (w / 2)) * halfAngle
    pos.setX(i, radius * Math.sin(theta))
    pos.setZ(i, radius * (1 - Math.cos(theta)))
  }
  pos.needsUpdate = true
  geo.computeVertexNormals()
  return geo
}

/** A soft elliptical bloom, drawn once into a canvas and reused as a texture. */
function glowTexture(THREE: typeof THREE_NS): THREE_NS.Texture {
  const c = document.createElement('canvas')
  c.width = 128
  c.height = 128
  const g = c.getContext('2d')!
  const grad = g.createRadialGradient(64, 64, 0, 64, 64, 64)
  grad.addColorStop(0, 'rgba(255,206,150,0.55)')
  grad.addColorStop(0.45, 'rgba(255,180,110,0.16)')
  grad.addColorStop(1, 'rgba(255,160,80,0)')
  g.fillStyle = grad
  g.fillRect(0, 0, 128, 128)
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  return t
}
