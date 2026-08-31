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
  showScreen(): void
  hideScreen(): void
  recenter(): void
  /** Brighten the warm spill as the player closes in (heat 0-100). */
  setHeat(heat: number): void
  dispose(): void
}

const SCREEN = {distance: 4.2, width: 3.0, height: 1.26, y: 0.9, sag: 0.42}

export async function createArStage(
  canvas: HTMLCanvasElement,
  video: HTMLVideoElement,
  posterUrl?: string,
): Promise<ArStage> {
  const THREE = await import('three')

  const renderer = new THREE.WebGLRenderer({canvas, alpha: true, antialias: true})
  renderer.setClearAlpha(0)
  const scene = new THREE.Scene()
  const camera = new THREE.PerspectiveCamera(72, 1, 0.05, 100)

  const resize = () => {
    const w = window.innerWidth
    const h = window.innerHeight
    renderer.setPixelRatio(Math.min(2, window.devicePixelRatio))
    renderer.setSize(w, h, false)
    camera.aspect = w / h
    camera.updateProjectionMatrix()
  }
  resize()
  window.addEventListener('resize', resize)

  // ---- the anchored group (heading-locked) -------------------------------
  const anchor = new THREE.Group()
  scene.add(anchor)

  const geo = curvedGeometry(THREE, SCREEN.width, SCREEN.height, SCREEN.sag)
  const videoTex = new THREE.VideoTexture(video)
  videoTex.colorSpace = THREE.SRGBColorSpace
  const posterTex = posterUrl ? new THREE.TextureLoader().load(posterUrl) : null
  if (posterTex) posterTex.colorSpace = THREE.SRGBColorSpace
  const screenMat = new THREE.MeshBasicMaterial({
    map: posterTex ?? videoTex,
    transparent: true,
    opacity: 0,
    toneMapped: false,
  })

  // Keep the clip playing (browsers pause an off-screen <video>) and switch the
  // screen from poster → live video once it's actually running.
  let onVideo = !posterTex
  const keepPlaying = () => {
    if (video.paused) void video.play().catch(() => {})
    if (!onVideo && !video.paused && video.currentTime > 0 && video.readyState >= 2) {
      screenMat.map = videoTex
      screenMat.needsUpdate = true
      onVideo = true
    }
  }
  const playPoll = setInterval(keepPlaying, 500)
  const screen = new THREE.Mesh(geo, screenMat)
  screen.position.set(0, SCREEN.y, -SCREEN.distance)
  anchor.add(screen)

  // thin bright frame
  const frameMat = new THREE.MeshBasicMaterial({color: 0xf5f3ec, transparent: true, opacity: 0})
  const frame = new THREE.Mesh(
    curvedGeometry(THREE, SCREEN.width + 0.06, SCREEN.height + 0.06, SCREEN.sag),
    frameMat,
  )
  frame.position.copy(screen.position)
  frame.position.z -= 0.02
  anchor.add(frame)

  // warm spill on the ground in front of the screen
  const spillMat = new THREE.MeshBasicMaterial({
    color: 0xe8a54c,
    transparent: true,
    opacity: 0,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  })
  const spill = new THREE.Mesh(new THREE.CircleGeometry(3.4, 40), spillMat)
  spill.rotation.x = -Math.PI / 2
  spill.position.set(0, 0.02, -SCREEN.distance + 0.6)
  anchor.add(spill)

  const light = new THREE.PointLight(0xffd9a8, 0, 12)
  light.position.set(0, SCREEN.y, -SCREEN.distance + 1.5)
  anchor.add(light)

  // ---- device orientation → camera quaternion ---------------------------
  const zee = new THREE.Vector3(0, 0, 1)
  const euler = new THREE.Euler()
  const q0 = new THREE.Quaternion()
  const qMinusHalfPiX = new THREE.Quaternion(-Math.SQRT1_2, 0, 0, Math.SQRT1_2)
  const deg2rad = Math.PI / 180
  let orient = {alpha: 0, beta: 0, gamma: 0}
  let headingOffset = 0
  let haveReading = false

  const onOrient = (e: DeviceOrientationEvent) => {
    orient = {alpha: e.alpha ?? 0, beta: e.beta ?? 0, gamma: e.gamma ?? 0}
    haveReading = true
  }
  window.addEventListener('deviceorientation', onOrient, true)

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
    // heading-lock the anchor: rotate it opposite the captured heading
    anchor.rotation.y = headingOffset
  }

  // ---- show / hide / recenter -----------------------------------------
  let visible = false
  let shownAt = 0

  const stage: ArStage = {
    showScreen() {
      visible = true
      shownAt = performance.now()
      // anchor to whatever direction you're facing right now
      headingOffset = -orient.alpha * deg2rad
      void video.play().catch(() => {})
    },
    hideScreen() {
      visible = false
    },
    recenter() {
      headingOffset = -orient.alpha * deg2rad
    },
    setHeat(heat: number) {
      const k = Math.max(0, Math.min(1, heat / 100))
      light.intensity = 0.4 + k * 2.2
      spillMat.opacity = visible ? 0.14 + k * 0.22 : 0
    },
    dispose() {
      running = false
      clearInterval(playPoll)
      window.removeEventListener('resize', resize)
      window.removeEventListener('deviceorientation', onOrient, true)
      geo.dispose()
      screenMat.dispose()
      frameMat.dispose()
      spillMat.dispose()
      videoTex.dispose()
      posterTex?.dispose()
      renderer.dispose()
    },
  }

  // ---- render loop ----------------------------------------------------
  let running = true
  const tick = () => {
    if (!running) return
    requestAnimationFrame(tick)
    if (haveReading) applyPose()

    // ease the screen in
    const t = visible ? Math.min(1, (performance.now() - shownAt) / 700) : 0
    const eased = t * t * (3 - 2 * t)
    screenMat.opacity = eased
    frameMat.opacity = eased * 0.9
    screen.scale.setScalar(0.9 + eased * 0.1)
    frame.scale.copy(screen.scale)
    // subtle life
    anchor.position.y = Math.sin(performance.now() / 1400) * 0.015

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
