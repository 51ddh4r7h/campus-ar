/**
 * Campus AR — minimal WebAR World Tracking MVP.
 *
 * Pipeline (current 8th Wall Engine Binary API, see https://8thwall.org/docs/engine/overview):
 *   1. The engine binary loads via <script> in index.html (data-preload-chunks="slam"),
 *      which registers XR8.XrController (SLAM / world tracking). We await XR8Promise
 *      exported by the @8thwall/engine-binary npm package.
 *   2. "Start Navigation" -> XR8.run() requests camera permission and opens the feed.
 *   3. Camera pipeline modules run every frame:
 *        - GlTextureRenderer draws the camera feed to the canvas.
 *        - Threejs.pipelineModule creates the Three.js scene + camera, renders the
 *          transparent AR overlay, and keeps the scene camera synced to the XrController.
 *        - XrController.pipelineModule enables SLAM and exposes `processCpuResult.reality`
 *          with position/rotation/intrinsics/trackingStatus.
 *        - Two custom modules below: one builds the arrow path, one feeds the debug HUD.
 *   4. Once SLAM reaches trackingStatus 'NORMAL', we anchor a straight line of arrows
 *      in world space a short distance in front of the user.
 *   5. "Recenter" resets the world origin to the device's current pose and re-places
 *      the arrow path in front of the user.
 */
import {XR8Promise} from '@8thwall/engine-binary'
import * as THREE from 'three'
import './style.css'
import {fullWindowCanvasModule} from './full-window-canvas'
import type {Xr8, Xr8CameraPipelineModule, Xr8RealityFrameData} from './types/xr8'

// The engine's Threejs pipeline module reads a global THREE object (the official
// example does the same). This must be set before XR8.Threejs.pipelineModule() runs.
window.THREE = THREE

// ---------------------------------------------------------------------------
// DOM
// ---------------------------------------------------------------------------

const canvas = document.querySelector<HTMLCanvasElement>('#camerafeed')!
const startOverlay = document.querySelector<HTMLDivElement>('#start-overlay')!
const startButton = document.querySelector<HTMLButtonElement>('#start-button')!
const startError = document.querySelector<HTMLParagraphElement>('#start-error')!
const recenterButton = document.querySelector<HTMLButtonElement>('#recenter-button')!
const hint = document.querySelector<HTMLDivElement>('#hint')!
const hud = {
  engine: document.querySelector<HTMLSpanElement>('#hud-engine')!,
  device: document.querySelector<HTMLSpanElement>('#hud-device')!,
  camera: document.querySelector<HTMLSpanElement>('#hud-camera')!,
  tracking: document.querySelector<HTMLSpanElement>('#hud-tracking')!,
  reason: document.querySelector<HTMLSpanElement>('#hud-reason')!,
  arrows: document.querySelector<HTMLSpanElement>('#hud-arrows')!,
}

// ---------------------------------------------------------------------------
// Navigation path configuration — tweak these freely.
// ---------------------------------------------------------------------------

const ARROW_COUNT = 5        // Number of arrows in the path.
const ARROW_SPACING = 1.6    // Distance between arrows (world units).
const FIRST_ARROW_DIST = 1.4 // Distance from the user to the first arrow.
const ARROW_HEIGHT = 0.8     // Height of the arrows above the origin plane.
const ARROW_COLOR = 0x22d3ee // Cyan — pops nicely against most backgrounds.

// ---------------------------------------------------------------------------
// AR state.
// ---------------------------------------------------------------------------

let XR8: Xr8 | null = null // Set once the engine script has loaded.
let started = false         // Whether XR8.run() has been called.

/** Three.js scene objects, populated when the engine starts the XR scene. */
let scene: THREE.Scene | null = null
let renderer: THREE.WebGLRenderer | null = null

/** Anchored arrows live in this group. Moving the phone moves the camera, not the group. */
const arrows = new THREE.Group()
let arrowsPlaced = false

// --- 3D helpers ------------------------------------------------------------

/** Builds a single arrow mesh pointing along -Z (away from the user). */
function createArrow(): THREE.Group {
  const arrow = new THREE.Group()

  const material = new THREE.MeshStandardMaterial({
    color: ARROW_COLOR,
    emissive: ARROW_COLOR,
    emissiveIntensity: 0.45,
    roughness: 0.35,
    metalness: 0.1,
  })

  // Arrow head (cone points +Y by default; rotate -90° about X to point -Z).
  const head = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.34, 12), material)
  head.rotation.x = -Math.PI / 2

  // Arrow shaft.
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.24, 10), material)
  shaft.rotation.x = -Math.PI / 2
  shaft.position.z = 0.26

  arrow.add(head, shaft)
  return arrow
}

/** Places `ARROW_COUNT` arrows in a straight line in front of the origin. */
function placeArrowsInFront(): void {
  for (const child of [...arrows.children]) arrows.remove(child)

  for (let i = 0; i < ARROW_COUNT; i++) {
    const arrow = createArrow()
    arrow.position.set(0, ARROW_HEIGHT, -(FIRST_ARROW_DIST + i * ARROW_SPACING))
    arrows.add(arrow)
  }

  arrowsPlaced = true
  updateArrowsHud()
  hint.hidden = true
}

// --- Debug HUD helpers -----------------------------------------------------

const hudValue = (el: HTMLElement, text: string, tone: '' | 'good' | 'warn' | 'bad' = ''): void => {
  el.textContent = text
  el.classList.remove('good', 'warn', 'bad')
  if (tone) el.classList.add(tone)
}

function updateArrowsHud(): void {
  hudValue(hud.arrows, arrowsPlaced ? `${arrows.children.length} placed` : '—')
}

function setCameraStatus(payload: unknown): void {
  // The modern engine passes an object like {status: 'requesting' | 'hasStream';
  // older builds passed a plain string. Accept both.
  const status =
    typeof payload === 'string'
      ? payload
      : ((payload as {status?: string} | null | undefined)?.status ?? String(payload))

  const map: Record<string, {label: string; tone: 'good' | 'warn' | 'bad'}> = {
    requesting: {label: 'Requesting permission…', tone: 'warn'},
    hasStream: {label: 'Stream acquired', tone: 'warn'},
    hasVideo: {label: 'Running', tone: 'good'},
    // Non-mobile debugging session provided by the engine when allowedDevices is ANY.
    hasDesktop3D: {label: 'Desktop 3D (dev)', tone: 'good'},
    failed: {label: 'Failed', tone: 'bad'},
    'not-allowed': {label: 'Permission denied', tone: 'bad'},
  }
  const entry = map[status] ?? {label: status, tone: '' as const}
  hudValue(hud.camera, entry.label, entry.tone)

  // Surface the "move your phone" hint once the feed is live but not tracking yet.
  hint.hidden = status === 'requesting'
}

function setTrackingStatus(reality?: Xr8RealityFrameData): void {
  const status = reality?.trackingStatus
  const reason = reality?.trackingReason
  if (!status) return

  const reasonText = reason && reason !== 'UNSPECIFIED' ? reason : ''
  hudValue(hud.tracking, status, status === 'NORMAL' ? 'good' : status === 'LIMITED' ? 'warn' : 'bad')
  hudValue(hud.reason, reasonText || '—')
}

// --- Camera pipeline modules ----------------------------------------------

/**
 * 1) Custom scene module: builds the Three.js AR scene and anchors the arrows.
 *    Runs after XR8.Threejs.pipelineModule()'s onStart, so xrScene() is ready.
 */
const sceneModule = (): Xr8CameraPipelineModule => ({
  name: 'ar-navigation-scene',

  onStart: ({canvas: camCanvas}) => {
    const xrScene = XR8!.Threejs.xrScene()
    scene = xrScene.scene
    renderer = xrScene.renderer

    // Transparent AR overlay: only our meshes are drawn on top of the camera feed.
    renderer.setClearColor(0x000000, 0)

    // Simple lighting so the standard-material arrows read clearly.
    scene.add(new THREE.AmbientLight(0xffffff, 0.9))
    const directional = new THREE.DirectionalLight(0xffffff, 0.6)
    directional.position.set(2, 5, 3)
    scene.add(directional)

    // The arrow path is anchored in the scene root (world space).
    scene.add(arrows)

    // Start the camera at the origin looking down -Z ("forward").
    // XrController treats this pose as the tracking origin on frame 1.
    if (xrScene.camera) {
      xrScene.camera.position.set(0, 0, 0)
      xrScene.camera.quaternion.identity()
    }
    XR8!.XrController.updateCameraProjectionMatrix({
      origin: xrScene.camera.position,
      facing: xrScene.camera.quaternion,
    })

    // Prevent scroll / pinch gestures from hijacking the AR view.
    camCanvas.addEventListener('touchmove', (e) => e.preventDefault(), {passive: false})
  },

  onUpdate: ({processCpuResult}) => {
    const reality = processCpuResult?.reality as Xr8RealityFrameData | undefined
    setTrackingStatus(reality)

    // Once SLAM locks in, anchor the arrow path in front of the user.
    if (reality?.trackingStatus === 'NORMAL' && !arrowsPlaced) {
      placeArrowsInFront()
    }

    // Gentle floating animation — the arrows bob together but stay anchored.
    if (arrowsPlaced && arrows.children.length > 0) {
      arrows.position.y = Math.sin(performance.now() * 0.0025) * 0.05
    }
  },
})

/**
 * 2) HUD module: tracks camera/engine state for the debug overlay.
 */
const hudModule = (): Xr8CameraPipelineModule => ({
  name: 'ar-debug-hud',
  onCameraStatusChange: (status) => setCameraStatus(status),
})

// --- Boot ------------------------------------------------------------------

function startNavigation(): void {
  if (!XR8) {
    startError.hidden = false
    startError.textContent = 'AR engine not loaded yet. Please wait and retry.'
    return
  }
  if (started) return
  started = true

  startButton.disabled = true
  startButton.textContent = 'Starting…'

  try {
    // Requests camera permission and starts the camera run loop + SLAM.
    XR8.run({
      canvas,
      allowedDevices: XR8.XrConfig.device().ANY, // ANY allows desktop testing; use MOBILE_AND_HEADSETS for a production lock-down.
    })
  } catch (err) {
    started = false
    startButton.disabled = false
    startButton.textContent = 'Start Navigation'
    const message = err instanceof Error ? err.message : String(err)
    startError.hidden = false
    startError.textContent = `Failed to start AR: ${message}`
    return
  }

  startOverlay.classList.add('hidden')
  recenterButton.disabled = false
  hint.hidden = false
  updateArrowsHud()
}

function recenter(): void {
  if (!XR8 || !started) return

  // Reset the world origin + facing to the device's current pose and restart tracking.
  XR8.XrController.recenter()

  // Clear the old path; it is re-anchored in front of the user once SLAM re-locks.
  for (const child of [...arrows.children]) arrows.remove(child)
  arrows.position.y = 0
  arrowsPlaced = false
  updateArrowsHud()

  // Subtle haptic confirmation where supported.
  try {
    navigator.vibrate?.(15)
  } catch {
    /* no-op */
  }
}

startButton.addEventListener('click', startNavigation)
recenterButton.addEventListener('click', recenter)

// --- Engine loading --------------------------------------------------------

// Device summary for the HUD.
hudValue(hud.device, /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent) ? 'mobile' : 'desktop')

const onEngineReady = (xr8: Xr8): void => {
  if (XR8) return // Already initialized.
  XR8 = xr8

  hudValue(hud.engine, `3D AR v${xr8.version()}`)
  startButton.disabled = false
  startButton.textContent = 'Start Navigation'

  // Install the pipeline. Order matters:
  //   [engine modules] -> [full-window canvas] -> [our custom scene + HUD modules]
  XR8.addCameraPipelineModules([
    XR8.GlTextureRenderer.pipelineModule(), // Draws the camera feed to the canvas.
    XR8.Threejs.pipelineModule(),           // Creates the Three.js AR scene and renders it transparently.
    XR8.XrController.pipelineModule(),      // SLAM: 6DoF world tracking.
    fullWindowCanvasModule(),               // Sizes the canvas buffer to fill the phone viewport.
    sceneModule(),                          // Anchors the arrow path once tracking locks in.
    hudModule(),                            // Feeds the debug HUD.
  ])
}

// The npm helper resolves once the engine's <script> has finished loading.
XR8Promise.then(onEngineReady)

// Fallback: the package helper can fail if the engine tag is missing; also listen
// for the engine's own load event.
window.addEventListener('xrloaded', () => {
  if (window.XR8) onEngineReady(window.XR8)
})

// If the engine script never arrives (misconfigured deploy), say so clearly.
setTimeout(() => {
  if (!XR8) {
    startButton.disabled = true
    hudValue(hud.engine, 'engine not loaded', 'bad')
    startError.hidden = false
    startError.textContent =
      'The 8th Wall engine script did not load. Did you run "npm install" and start Vite? ' +
      'The engine lives in public/xr8/.'
  }
}, 15000)