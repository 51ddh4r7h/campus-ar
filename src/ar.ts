/**
 * AR session manager (8th Wall Engine + Three.js) — the camera IS the app.
 *
 * The pipeline is registered ONCE; the hunt runs a single long-lived
 * `XR8.run()` session (run → stop → run is supported; modules dedupe by name).
 * The session is spot-agnostic: the reveal gate asks `hooks.revealSpot()` when
 * it fires, so the game layer (main.ts) decides what is revealable.
 *
 * Owns the world→screen bridge:
 *  - ARWorld (film reel, ground shadow, set markers) — spec §11–13
 *  - the projected spatial label (spec §14)
 *  - signal-state forwarding to the world layer (spec §15)
 */
import {XR8Promise} from '@8thwall/engine-binary'
import * as THREE from 'three'
import {fullWindowCanvasModule} from './full-window-canvas'
import type {FilmSpot} from './data/spots'
import {createArWorld, type ArWorld} from './ar-world'
import {createFilmPortal, type FilmPortal} from './film-portal'
import {createRevealDevice, type RevealDevice} from './reveal'
import {createRevealGate, type RevealGate} from './reveal-gate'
import {haptics} from './haptics'
import type {Xr8, Xr8CameraPipelineModule, Xr8RealityFrameData, Xr8ThreejsHandle, XrCameraStatusData} from './types/xr8'

// The engine's Threejs pipeline module reads a global THREE object (the official
// example does the same). Must be set before XR8.Threejs.pipelineModule() runs.
window.THREE = THREE

const canvas = document.querySelector<HTMLCanvasElement>('#camerafeed')!

export type SignalLevel = 0 | 1 | 2 | 3 | 4

export interface ArHooks {
  /** Every frame with the tracking reality frame. */
  onTracking(reality?: Xr8RealityFrameData): void
  onCameraStatus(status: XrCameraStatusData): void
  /** The spot the reveal gate should reveal when it fires (null → nothing). */
  revealSpot(): FilmSpot | null
  /** Fired the instant the reveal triggers (mark the spot found, HUD, toast). */
  onReveal(spot: FilmSpot): void
  /** Fired ~1.25 s later, when the clapperboard presents — open the DOM panel. */
  onPanelOpen(spot: FilmSpot): void
  onError(message: string): void
  /** True while the GPS fix is inside the revealable spot's radius. */
  inRange(): boolean
}

// ------------------------------------------------------------------ engine
let XR8: Xr8 | null = null
let modulesInstalled = false
let running = false

function loadEngineScript(): Promise<void> {
  if (window.XR8) return Promise.resolve()
  return new Promise((resolve, reject) => {
    const script = document.createElement('script')
    script.src = './xr8/xr.js'
    script.async = true
    script.crossOrigin = 'anonymous'
    script.dataset.preloadChunks = 'slam'
    script.addEventListener('load', () => resolve(), {once: true})
    script.addEventListener('error', () => reject(new Error('Engine load failed — reload and try again.')), {once: true})
    document.head.appendChild(script)
  })
}

const bootEngine = async (): Promise<Xr8> => {
  if (XR8) return XR8
  await loadEngineScript()
  XR8 = await XR8Promise
  if (!XR8) throw new Error('8th Wall engine did not initialise.')
  return XR8
}

function installModules(xr8: Xr8): void {
  if (modulesInstalled) return
  modulesInstalled = true
  xr8.addCameraPipelineModules([
    xr8.GlTextureRenderer.pipelineModule(), // Draws the camera feed to the canvas.
    xr8.Threejs.pipelineModule(),           // Creates the Three.js AR scene + renders transparently.
    xr8.XrController.pipelineModule(),      // SLAM: 6DoF world tracking.
    fullWindowCanvasModule(),               // Sizes the canvas buffer to fill the viewport.
    sceneModule(),                          // Owns the AR world + reveal device + reveal gate.
    hudModule(),                            // Feeds camera status to the debug HUD.
  ])
}

// ---------------------------------------------------------------- session
interface ActiveSession {
  hooks: ArHooks
  revealed: boolean
  /** Owns the "inside for ≥2 s with NORMAL tracking" rule. */
  gate: RevealGate
}

let active: ActiveSession | null = null
let lastFrameAt = 0
let revealDevice: RevealDevice | null = null
let arWorld: ArWorld | null = null
let portal: FilmPortal | null = null
let portalSpot: FilmSpot | null = null
let xrSceneRef: Xr8ThreejsHandle | null = null
let currentSignal: SignalLevel = 0
let recenterPending = false
const labelState = {name: '', sub: ''}

const triggerReveal = (): void => {
  const session = active
  if (!session || session.revealed) return
  const spot = session.hooks.revealSpot()
  if (!spot) return
  session.revealed = true
  session.gate.reset()
  // No clapperboard — keep the curved screen as the hero, just open the panel
  // (slate device is disabled per UX request)
  session.hooks.onReveal(spot)
  // Small delay so the "You're close" → panel transition feels intentional, not instant pop
  setTimeout(() => session.hooks.onPanelOpen(spot), 320)
}

function setupCamera(xrScene: Xr8ThreejsHandle): void {
  // Start the camera at the origin looking down -Z ("forward").
  if (xrScene.camera) {
    xrScene.camera.position.set(0, 0, 0)
    xrScene.camera.quaternion.identity()
  }
  XR8!.XrController.updateCameraProjectionMatrix({
    origin: xrScene.camera.position,
    facing: xrScene.camera.quaternion,
  })
}

// ---------------------------------------------------------------- spatial label
interface LabelElements {
  root: HTMLElement | null
  name: HTMLElement | null
  sub: HTMLElement | null
}

const labelEl: LabelElements = {
  root: null,
  name: null,
  sub: null,
}
const projection = new THREE.Vector3()

function projectLabel(camera: THREE.Camera): void {
  if (labelEl.root === null) {
    labelEl.root = document.getElementById('ar-label')
    labelEl.name = document.getElementById('ar-label-name')
    labelEl.sub = document.getElementById('ar-label-state')
  }
  const root = labelEl.root
  if (!root || !arWorld) return

  const show = currentSignal >= 1 && !active?.revealed && labelState.name !== ''
  if (!show) {
    root.classList.add('hidden')
    return
  }
  arWorld.anchor.getWorldPosition(projection)
  projection.project(camera)
  if (projection.z >= 1) {
    root.classList.add('hidden')
    return
  }
  const x = (projection.x * 0.5 + 0.5) * window.innerWidth
  const y = (-projection.y * 0.5 + 0.5) * window.innerHeight
  root.style.left = `${x.toFixed(1)}px`
  root.style.top = `${y.toFixed(1)}px`
  root.classList.remove('hidden')
  if (labelEl.name) labelEl.name.textContent = labelState.name
  if (labelEl.sub) labelEl.sub.textContent = labelState.sub
}

// ---------------------------------------------------------------- modules
const sceneModule = (): Xr8CameraPipelineModule => ({
  name: 'campus-ar-scene',

  onStart: ({canvas: camCanvas}) => {
    if (!XR8) return
    const xrScene = XR8.Threejs.xrScene()
    const scene = xrScene.scene
    const renderer = xrScene.renderer
    xrSceneRef = xrScene

    // Transparent AR overlay: only our meshes draw over the camera feed.
    renderer.setClearColor(0x000000, 0)

    // Install stage lighting once per scene lifecycle.
    // SAFETY: scene.userData is engine-provided storage; `stageLit` is a key
    // this module owns and the only one it reads back.
    const meta = scene.userData as {stageLit?: boolean}
    if (!meta.stageLit) {
      scene.add(new THREE.AmbientLight(0xffffff, 1.05))
      const key = new THREE.DirectionalLight(0xffffff, 0.75)
      key.position.set(2, 5, 3)
      scene.add(key)
      const fill = new THREE.DirectionalLight(0xfff1d0, 0.3)
      fill.position.set(-3, 2, -2)
      scene.add(fill)
      meta.stageLit = true
    }

    setupCamera(xrScene)

    // Fresh AR world + portal + reveal device for this session (anchored in world space).
    arWorld?.reset()
    if (!arWorld) arWorld = createArWorld(scene)
    arWorld.setSignal(currentSignal)
    if (!portal) {
      portal = createFilmPortal(scene)
      portal.setSignal(currentSignal)
      // Demo mode can request the portal before the async XR boot finishes.
      // Replay that pending request now that the Three.js portal exists.
      if (portalSpot) portal.show(portalSpot)
    } else {
      portal.hide()
      if (portalSpot) portal.show(portalSpot)
    }
    if (revealDevice) revealDevice.reset()
    revealDevice = createRevealDevice(scene)
    revealDevice.onOpen = (spot) => active?.hooks.onPanelOpen(spot)

    // Prevent scroll / pinch gestures from hijacking the AR view.
    camCanvas.addEventListener('touchmove', (e) => e.preventDefault(), {passive: false})
  },

  onUpdate: ({processCpuResult}) => {
    const reality = processCpuResult?.reality
    // RCA: raw tracking status every frame, not inferred
    if (new URLSearchParams(window.location.search).has('debug')) {
      const rcaEl = document.getElementById('rca-tracking')
      if (rcaEl) {
        const s = reality?.trackingStatus ?? 'NONE'
        const r = reality?.trackingReason ?? '—'
        rcaEl.textContent = `${s} / ${r}`
      }
    }
    const session = active
    if (session) session.hooks.onTracking(reality)

    const now = performance.now()
    const dt = lastFrameAt ? Math.min(64, now - lastFrameAt) : 16
    lastFrameAt = now

    if (session && !session.revealed) {
      const verdict = session.gate.tick({
        inside: session.hooks.inRange(),
        trackingNormal: reality?.trackingStatus === 'NORMAL',
        dtMs: dt,
      })
      if (verdict === 'fire') triggerReveal()
    }

    revealDevice?.tick(now)
    if (recenterPending && xrSceneRef) {
      portal?.recenter(xrSceneRef.camera.position, xrSceneRef.camera.quaternion)
      arWorld?.recenter(xrSceneRef.camera.position, xrSceneRef.camera.quaternion)
      recenterPending = false
    }
    if (xrSceneRef) portal?.tick(now, xrSceneRef.camera.position, xrSceneRef.camera.quaternion)
    if (arWorld && xrSceneRef) {
      arWorld.tick(now, xrSceneRef.camera.position, xrSceneRef.camera.quaternion)
      projectLabel(xrSceneRef.camera)
    }
  },
})

const hudModule = (): Xr8CameraPipelineModule => ({
  name: 'campus-ar-hud',
  onCameraStatusChange: (status) => active?.hooks.onCameraStatus(status),
})

// ------------------------------------------------------------------- api
export interface ArControl {
  /** Opens the camera and starts the long-lived hunt session. */
  start(hooks: ArHooks): void
  /** Closes the camera session. Safe to call when nothing is running. */
  stop(): void
  /** Resets the world origin to the device's current pose. */
  recenter(): void
  /** Dev/sim hook: force the reveal without waiting for tracking NORMAL. */
  forceReveal(): void
  getActiveSpot(): FilmSpot | null
  /** Signal-reactive AR: 0 cold → 4 on-set (spec §15). */
  setSignal(level: SignalLevel): void
  /** Spatial label content for the world-anchored reel. */
  setLabel(name: string, sub: string): void
  /** Film-set portal — the walk-aroundable frame (§17 portal spec). */
  showPortal(spot: FilmSpot): void
  hidePortal(): void
}

export const createArControl = (): ArControl => ({
  start(hooks) {
    if (running) this.stop()

    active = {hooks, revealed: false, gate: createRevealGate()}
    lastFrameAt = 0
    currentSignal = 0
    labelState.name = ''
    labelState.sub = ''

    bootEngine()
      .then((xr8) => {
        if (!active) return // stopped (or superseded) while the engine booted
        installModules(xr8)
        running = true
        xr8.run({
          canvas,
          allowedDevices: xr8.XrConfig.device().ANY, // ANY lets desktop dev-servers test; tighten at prod.
        })
      })
      .catch((cause: unknown) => {
        active = null
        hooks.onError(cause instanceof Error ? cause.message : String(cause))
      })
  },

  stop() {
    active = null
    recenterPending = false
    portal?.hide()
    labelEl.root?.classList.add('hidden')
    if (running && XR8) {
      try {
        XR8.stop()
      } catch {
        /* already stopped */
      }
    }
    running = false
  },

  recenter() {
    if (!running || !XR8 || !xrSceneRef) return
    try {
      // Reset XR first. The next frame reads the post-reset pose and moves every
      // world object together, preventing a one-frame split between reel/screen.
      try { XR8.XrController.recenter() } catch { /* no-op */ }
      recenterPending = true
      try {
        XR8.XrController.updateCameraProjectionMatrix({
          origin: xrSceneRef.camera.position,
          facing: xrSceneRef.camera.quaternion,
        })
      } catch { /* no-op */ }
      haptics.tick()
      window.dispatchEvent(new CustomEvent('campus-ar:recenter-done'))
    } catch {
      /* no-op */
    }
  },

  forceReveal() {
    triggerReveal()
  },

  getActiveSpot() {
    return active?.hooks.revealSpot() ?? null
  },

  setSignal(level) {
    currentSignal = level
    arWorld?.setSignal(level)
    portal?.setSignal(level)
  },

  setLabel(name, sub) {
    labelState.name = name
    labelState.sub = sub
  },

  showPortal(spot) {
    portalSpot = spot
    portal?.show(spot)
  },

  hidePortal() {
    portalSpot = null
    portal?.hide()
  },
})
