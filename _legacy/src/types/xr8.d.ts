/**
 * Minimal TypeScript types for the current 8th Wall Engine Binary API
 * (https://8thwall.org/docs/engine/overview).
 *
 * The engine loads the `XR8` global via a <script> tag with
 * `data-preload-chunks="slam"`, which registers `XR8.XrController`.
 *
 * Only the surface used by this MVP is typed. Everything else on `XR8`
 * remains untyped on purpose — extend as needed.
 */
import type * as THREE from 'three'

// ---------------------------------------------------------------------------
// Light-weight structural types matching the engine's data shape.
// ---------------------------------------------------------------------------

export interface Xr8Vec3 {
  x: number
  y: number
  z: number
}

export interface Xr8Quat {
  /** The engine uses either `qw` or `w`, depending on the component. */
  qw?: number | null
  w?: number | null
  x: number
  y: number
  z: number
}

/** `processCpuResult.reality` produced by XR8.XrController.pipelineModule(). */
export interface Xr8RealityFrameData {
  rotation: Xr8Quat
  position: Xr8Vec3
  intrinsics: number[]
  trackingStatus: 'NORMAL' | 'LIMITED' | 'NOT_AVAILABLE' | 'UNSPECIFIED' | string
  trackingReason:
    | 'UNSPECIFIED'
    | 'INITIALIZING'
    | 'RELOCALIZING'
    | 'EXCESSIVE_MOTION'
    | 'INSUFFICIENT_FEATURES'
    | string
  worldPoints?: Array<{id: number; position: Xr8Vec3; confidence: number}>
  realityTexture?: unknown
  lighting?: {exposure: number; temperature: number}
}

/** The `{scene, camera, renderer}` handle returned by XR8.Threejs.xrScene(). */
export interface Xr8ThreejsHandle {
  scene: THREE.Scene
  camera: THREE.PerspectiveCamera
  renderer: THREE.WebGLRenderer
  cameraTexture?: THREE.Texture
  layerScenes?: Record<string, THREE.Scene>
}

/** Per-frame payload for `onCameraStatusChange` — a bare string or a detail object. */
export interface XrCameraStatusDetail {
  status?: string
  reason?: string
  video?: {videoWidth: number; videoHeight: number}
}

export type XrCameraStatusData = string | XrCameraStatusDetail | null | undefined

/** The `processCpuResult` bag handed to onUpdate, keyed by pipeline module. */
export interface Xr8ProcessCpuResult {
  reality?: Xr8RealityFrameData
}

/** A single camera pipeline module. See https://8thwall.org/docs/api/engine/camerapipelinemodule */
export interface Xr8CameraPipelineModule {
  name: string
  onStart?: (params: {canvas: HTMLCanvasElement}) => void
  onAttach?: (params: {
    canvas: HTMLCanvasElement
    orientation: number
    videoWidth: number
    videoHeight: number
  }) => void
  onDetach?: () => void
  onUpdate?: (params: {processCpuResult?: Xr8ProcessCpuResult}) => void
  onCameraStatusChange?: (status: XrCameraStatusData) => void
  onVideoSizeChange?: (params: {videoWidth: number; videoHeight: number}) => void
  onCanvasSizeChange?: () => void
  onDeviceOrientationChange?: (params: {orientation: number}) => void
  listeners?: Array<{event: string; process: (args: {name: string; detail: unknown}) => void}>
}

/** The subset of the global `XR8` object used by this app. */
export interface Xr8 {
  Threejs: {
    pipelineModule(): Xr8CameraPipelineModule
    xrScene(): Xr8ThreejsHandle
    configure(opts: {renderCameraTexture?: boolean; layerScenes?: string[]}): void
  }
  XrController: {
    pipelineModule(): Xr8CameraPipelineModule
    configure(opts?: {
      disableWorldTracking?: boolean
      enableLighting?: boolean
      enableWorldPoints?: boolean
      scale?: 'responsive' | 'absolute'
      leftHandedAxes?: boolean
      mirroredDisplay?: boolean
      imageTargetData?: unknown[]
    }): void
    updateCameraProjectionMatrix(opts: {
      origin: Xr8Vec3 | THREE.Vector3
      facing: Xr8Quat | THREE.Quaternion
      updateRecenterPoint?: boolean
    }): void
    recenter(): void
  }
  GlTextureRenderer: {
    pipelineModule(): Xr8CameraPipelineModule
  }
  XrDevice: {
    isDeviceBrowserCompatible(opts: {allowedDevices: string}): boolean
    deviceEstimate(): {model: string; os: string}
  }
  XrConfig: {
    device(): {ANY: string; DESKTOP: string; MOBILE: string; HEADSETS: string; MOBILE_AND_HEADSETS: string}
    camera(): {BACK: string; FRONT: string}
  }
  run(opts: {
    canvas: HTMLCanvasElement
    allowedDevices?: string
    cameraConfig?: {direction?: string}
  }): void
  /** Ends the current camera session. A later run() restarts it. */
  stop(): void
  addCameraPipelineModules(modules: Xr8CameraPipelineModule[]): void
  requiredPermissions(): string[]
  version(): string
}

// ---------------------------------------------------------------------------
// Globals, plus the module type for the npm package's XR8Promise helper.
// ---------------------------------------------------------------------------

declare global {
  interface Window {
    XR8: Xr8
    /** Required by XR8.Threejs.pipelineModule() — assigned in main.ts. */
    THREE: typeof THREE
  }

  const XR8: Xr8
}

declare module '@8thwall/engine-binary' {
  /** Resolves to the global `XR8` once the engine script has loaded. */
  export const XR8Promise: Promise<Xr8>
}