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

const bootEngine = async (): Promise<Xr8> => {
  if (XR8) return XR8
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
const labelState = {name: '', sub: ''}

const triggerReveal = (): void => {
  const session = active
  if (!session || session.revealed) return
  const spot = session.hooks.revealSpot()
  if (!spot) return
  session.revealed = true
  session.gate.reset()
  revealDevice?.show(spot)
  session.hooks.onReveal(spot)
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
const labelEl = {root: null as HTMLElement | null, name: null as HTMLElement | null, sub: null as HTMLElement | null}
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
    if (!portal) portal = createFilmPortal(scene)
    else portal.hide()
    if (revealDevice) revealDevice.reset()
    revealDevice = createRevealDevice(scene)
    revealDevice.onOpen = (spot) => active?.hooks.onPanelOpen(spot)

    // Prevent scroll / pinch gestures from hijacking the AR view.
    camCanvas.addEventListener('touchmove', (e) => e.preventDefault(), {passive: false})
  },

  onUpdate: ({processCpuResult}) => {
    const reality = processCpuResult?.reality
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
    portal?.tick(now)
    if (arWorld && xrSceneRef) {
      arWorld.tick(now, xrSceneRef.camera.position)
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
    if (!running || !XR8) return
    try {
      XR8.XrController.recenter()
      if (arWorld && xrSceneRef) arWorld.recenter(xrSceneRef.camera.position)
      if (portal && portalSpot) {
        // Keep the portal ahead after recenter — re-show at new origin if it was visible.
        const wasVisible = portal.group.visible
        const spot = portalSpot
        if (wasVisible && spot) {
          portal.hide()
          // Re-place after XR recenter settles (next frame's tick will place it).
          requestAnimationFrame(() => portal?.show(spot))
        }
      }
      haptics.tick()
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
