/**
 * AR session manager (8th Wall Engine + Three.js).
 *
 * Wrap-up of Phase 1's tracking pipeline, reworked:
 *  - The arrow trail is GONE — no more anchored waypoints.
 *  - The pipeline is registered ONCE; each "open camera" runs a fresh
 *    `XR8.run()`, and closing runs `XR8.stop()`, per the engine's documented
 *    lifecycle (run → stop → run is supported; modules dedupe by name).
 *  - The scene module owns the reveal device and the "inside for ≥2 s with
 *    tracking NORMAL" reveal trigger.
 */

import {XR8Promise} from '@8thwall/engine-binary'
import * as THREE from 'three'
import {fullWindowCanvasModule} from './full-window-canvas'
import type {FilmSpot} from './data/spots'
import {createRevealDevice, type RevealDevice} from './reveal'
import type {Xr8, Xr8CameraPipelineModule, Xr8RealityFrameData, Xr8ThreejsHandle, XrCameraStatusData} from './types/xr8'

// The engine's Threejs pipeline module reads a global THREE object (the official
// example does the same). Must be set before XR8.Threejs.pipelineModule() runs.
window.THREE = THREE

const canvas = document.querySelector<HTMLCanvasElement>('#camerafeed')!

export interface ArHooks {
  /** Every frame with the tracking reality frame. */
  onTracking(reality?: Xr8RealityFrameData): void
  onCameraStatus(status: XrCameraStatusData): void
  /** Fired the instant the reveal triggers (mark the spot found, HUD, toast). */
  onReveal(spot: FilmSpot): void
  /** Fired ~1.25 s later, when the clapperboard presents — open the DOM panel. */
  onPanelOpen(spot: FilmSpot): void
  onError(message: string): void
  /** True while the GPS fix is inside the active spot's radius. */
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
    sceneModule(),                          // Owns the reveal device + inside-for-2s trigger.
    hudModule(),                            // Feeds camera status to the debug HUD.
  ])
}

// ---------------------------------------------------------------- session
interface ActiveSession {
  spot: FilmSpot
  hooks: ArHooks
  revealed: boolean
}

let active: ActiveSession | null = null
let insideMs = 0
let lastFrameAt = 0
let revealDevice: RevealDevice | null = null

const REVEAL_INSIDE_MS = 2000

const triggerReveal = (): void => {
  const session = active
  if (!session || session.revealed) return
  session.revealed = true
  insideMs = 0
  revealDevice?.show(session.spot)
  session.hooks.onReveal(session.spot)
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

// ---------------------------------------------------------------- modules
const sceneModule = (): Xr8CameraPipelineModule => ({
  name: 'campus-ar-scene',

  onStart: ({canvas: camCanvas}) => {
    if (!XR8) return
    const xrScene = XR8.Threejs.xrScene()
    const scene = xrScene.scene
    const renderer = xrScene.renderer

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

    // Fresh reveal device for this session (anchored in world space).
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

    if (session && !session.revealed && reality?.trackingStatus === 'NORMAL') {
      // 2 continuous seconds inside the radius count only while tracking is
      // locked. Brief tracking loss pauses the clock; leaving the radius resets it.
      if (session.hooks.inRange()) {
        insideMs += dt
        if (insideMs >= REVEAL_INSIDE_MS) triggerReveal()
      } else {
        insideMs = 0
      }
    }

    revealDevice?.tick(now)
  },
})

const hudModule = (): Xr8CameraPipelineModule => ({
  name: 'campus-ar-hud',
  onCameraStatusChange: (status) => active?.hooks.onCameraStatus(status),
})

// ------------------------------------------------------------------- api
export interface ArControl {
  /** Opens the camera and starts world tracking for the given spot. */
  start(spot: FilmSpot, hooks: ArHooks): void
  /** Closes the camera session. Safe to call when nothing is running. */
  stop(): void
  /** Resets the world origin to the device's current pose. */
  recenter(): void
  /** Dev/sim hook: force the reveal without waiting for tracking NORMAL. */
  forceReveal(): void
  getActiveSpot(): FilmSpot | null
}

export const createArControl = (): ArControl => ({
  start(spot, hooks) {
    if (running) this.stop()

    active = {spot, hooks, revealed: false}
    insideMs = 0
    lastFrameAt = 0

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
    insideMs = 0
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
      navigator.vibrate?.(15)
    } catch {
      /* no-op */
    }
  },

  forceReveal() {
    triggerReveal()
  },

  getActiveSpot() {
    return active?.spot ?? null
  },
})