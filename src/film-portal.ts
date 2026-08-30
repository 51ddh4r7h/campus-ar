/**
 * Film Screen — curved cinemascope, the hunt's centerpiece.
 *
 * Simple: a single gently-curved 2.39:1 screen floating further out.
 * The clip plays on it. No doorway, no cone, no plinth.
 * Appears when HOT, further by default (2.4m), RECENTER brings it back in front.
 */

import * as THREE from 'three'
import type {FilmSpot} from './data/spots'
import {getNetworkConnection} from './network'

export type PortalSignal = 0 | 1 | 2 | 3 | 4

export interface FilmPortal {
  readonly group: THREE.Group
  show(spot: FilmSpot): void
  hide(): void
  setSignal(level: PortalSignal): void
  recenter(cameraPos: THREE.Vector3, cameraQuat: THREE.Quaternion): void
  tick(nowMs: number, cameraPos?: THREE.Vector3, cameraQuat?: THREE.Quaternion): void
  dispose(): void
}

const DIST = 2.4 // tighter so it fits within phone width, not top bar
const W = 1.55 // cinemascope 2.39:1 — fits within viewport width with margin, true AR object
const H = 0.65
const SAG = 0.38 // pronounced 1000R curve — visible wrap, not subtle barrel

function makeCurvedGeometry(w: number, h: number, sag: number, segW = 48, segH = 1): THREE.BufferGeometry {
  const geo = new THREE.PlaneGeometry(w, h, segW, segH)
  const pos = geo.attributes.position
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i)
    // cylindrical 1000R curve — deeper wrap than parabolic, new-age cinemascope
    const nx = x / (w / 2)
    const z = -sag * (nx * nx * (0.7 + 0.3 * Math.abs(nx))) // cubic falloff for stronger edge bend
    pos.setZ(i, z)
  }
  pos.needsUpdate = true
  geo.computeVertexNormals()
  return geo
}

export function createFilmPortal(scene: THREE.Scene): FilmPortal {
  const group = new THREE.Group()
  group.visible = false
  // Grounding cue: soft contact shadow + faint grid so tilt is self-evident
  const groundCue = new THREE.Mesh(
    new THREE.CircleGeometry(1.4, 32),
    new THREE.MeshBasicMaterial({color: 0x000000, transparent: true, opacity: 0, depthWrite: false}),
  )
  groundCue.rotation.x = -Math.PI / 2
  groundCue.position.y = -1.45
  groundCue.visible = false
  // Grid helper for "flush vs floating wrong" feedback — very subtle
  const grid = new THREE.GridHelper(4, 8, 0x2a334a, 0x1e2635)
  const gridMaterials = Array.isArray(grid.material) ? grid.material : [grid.material]
  for (const material of gridMaterials) {
    material.transparent = true
    material.opacity = 0
  }
  grid.position.y = -1.44
  grid.visible = false
  group.add(groundCue, grid)

  // ── screen: canvas still -> video
  const canvas = document.createElement('canvas')
  canvas.width = 640
  canvas.height = 268 // 2.39:1
  const ctx = canvas.getContext('2d')!
  const contentTexture = new THREE.CanvasTexture(canvas)
  contentTexture.colorSpace = THREE.SRGBColorSpace

  const videoEl = document.createElement('video')
  videoEl.muted = true
  videoEl.loop = true
  videoEl.playsInline = true
  videoEl.preload = 'none'
  videoEl.setAttribute('playsinline', '')
  videoEl.setAttribute('preload', 'none')
  videoEl.style.display = 'none'
  document.body.appendChild(videoEl)
  let videoReady = false
  let videoFailed = false
  let videoSrc = ''
  let videoFallbackSrc: string | null = null
  let pendingSrc: string | null = null
  videoEl.addEventListener('loadeddata', () => {
    videoReady = true
    console.log(`[portal] loadeddata ${videoSrc} readyState:${videoEl.readyState}`)
    updatePortalDebug()
  })
  videoEl.addEventListener('error', () => {
    console.warn(`[portal] video error ${videoSrc}`, videoEl.error)
    // S3 can fail because of CORS, range requests, captive portals, or a
    // regional endpoint issue. Keep the S3 URL primary, but never leave the
    // projected screen blank when the identical deployed asset is available.
    if (videoFallbackSrc && videoSrc !== videoFallbackSrc) {
      console.warn(`[portal] falling back to ${videoFallbackSrc}`)
      ensureVideo(videoFallbackSrc)
      return
    }
    videoFailed = true
    updatePortalDebug()
  })
  videoEl.addEventListener('stalled', () => console.warn('[portal] stalled', videoSrc))
  const videoTexture = new THREE.VideoTexture(videoEl)
  videoTexture.colorSpace = THREE.SRGBColorSpace

  const ensureVideo = (src: string): void => {
    if (!src || videoSrc === src) return
    const conn = getNetworkConnection()
    if (conn?.saveData || conn?.effectiveType === '2g' || conn?.effectiveType === 'slow-2g') return
    pendingSrc = null
    videoSrc = src
    videoFailed = false
    videoReady = false
    // AWS S3 needs crossOrigin anonymous for VideoTexture (CORS *), same-origin Pages does not
    if (src.includes('s3.amazonaws.com') || src.includes('s3.ap-south-1')) {
      videoEl.crossOrigin = 'anonymous'
      videoEl.setAttribute('crossorigin', 'anonymous')
    } else {
      videoEl.removeAttribute('crossorigin')
      videoEl.crossOrigin = ''
    }
    videoEl.src = src
    videoEl.load()
    const tryPlay = (): void => {
      videoEl.play().catch((err) => {
        // Autoplay may be blocked until next gesture — retry on any tap/click
        console.warn('[portal] play blocked', err?.name)
        const onTap = (): void => {
          videoEl.play().catch(()=>undefined)
          window.removeEventListener('click', onTap)
          window.removeEventListener('touchend', onTap)
        }
        window.addEventListener('click', onTap, {once: true})
        window.addEventListener('touchend', onTap, {once: true})
      })
    }
    tryPlay()
    // Also retry on visibility change (user returns to tab)
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden && videoEl.paused && videoReady) videoEl.play().catch(()=>undefined)
    }, {once: true})
  }

  // Curved screen mesh
  const screenGeo = makeCurvedGeometry(W, H, SAG)
  const screenMat = new THREE.MeshBasicMaterial({
    map: contentTexture,
    transparent: true,
    opacity: 0,
    side: THREE.DoubleSide,
  })
  const screen = new THREE.Mesh(screenGeo, screenMat)
  group.add(screen)

  // A restrained illuminated edge gives the screen a physical boundary in
  // busy camera scenes. It materialises with the image instead of reading as
  // a flat HTML rectangle floating over the feed.
  const frameMat = new THREE.LineBasicMaterial({color: 0xf3b93f, transparent: true, opacity: 0})
  const screenFrame = new THREE.LineSegments(new THREE.EdgesGeometry(screenGeo), frameMat)
  screenFrame.scale.setScalar(1.01)
  group.add(screenFrame)

  // (test cube removed — was for mobile/desktop split debug)

  // Reference is edgeless — no bezel box.

  const drawStill = (spot: FilmSpot): void => {
    // Dark with loading hint — so "vanished" isn't confused with "loading 1.5MB on 4G"
    ctx.clearRect(0, 0, 640, 268)
    const grad = ctx.createLinearGradient(0, 0, 0, 268)
    grad.addColorStop(0, '#0f141e')
    grad.addColorStop(1, '#0b0e16')
    ctx.fillStyle = grad
    ctx.fillRect(0, 0, 640, 268)
    ctx.fillStyle = 'rgba(255,255,255,0.03)'
    for (let i = 0; i < 60; i++) ctx.fillRect(Math.random() * 640, Math.random() * 268, 1, 1)
    ctx.textAlign = 'center'
    ctx.fillStyle = 'rgba(216,196,160,0.85)'
    ctx.font = '11px "Instrument Sans", system-ui, sans-serif'
    ctx.fillText('LOADING CLIP…', 320, 128)
    ctx.fillStyle = 'rgba(255,255,255,0.45)'
    ctx.font = '10px ui-monospace, monospace'
    ctx.fillText(`${spot.movie.title.toUpperCase()} • ${spot.name.toUpperCase()}`, 320, 148)
    contentTexture.needsUpdate = true
  }

  // ── state
  let currentSpot: FilmSpot | null = null
  let signal: PortalSignal = 0
  let targetOpacity = 0
  let currentOpacity = 0
  let spawnTime = 0
  let spawned = false
  const debugEnabled = import.meta.env.DEV && new URLSearchParams(window.location.search).has('debug')

  const updatePortalDebug = (): void => {
    const el = document.getElementById('portal-debug')
    const txt = document.getElementById('portal-debug-text')
    if (!debugEnabled || !el || !txt) return
    const dbgVis = currentSpot ? `${currentSpot.id} sig:${signal} vis:${group.visible} spawned:${spawned} op:${currentOpacity.toFixed(2)}/${targetOpacity.toFixed(2)}` : `no spot sig:${signal} vis:${group.visible} spawned:${spawned} hasSpot:${currentSpot!==null}`
    const vid = videoSrc ? `${videoSrc.split('/').pop()} rdy:${videoReady} fail:${videoFailed} pend:${pendingSrc ?? '–'}` : 'no video'
    const pos = `${group.position.x.toFixed(2)},${group.position.y.toFixed(2)},${group.position.z.toFixed(2)} rotY:${(group.rotation.y * 180 / Math.PI).toFixed(0)} scale:${group.scale.x.toFixed(2)}`
    const xrAvail = window.XR8 !== undefined ? 'xr:yes' : 'xr:no'
    txt.textContent = `portal: ${dbgVis} | ${vid} | pos:${pos} | ${xrAvail} | cam:${(document.getElementById('ar-chrome')?.classList.contains('hidden') ? 'no-ar' : 'ar')}`
    // Always show in AR when in demo/sim so mobile vanish is self-evident
    const inAr = !document.getElementById('ar-chrome')?.classList.contains('hidden')
    const shouldShow = inAr && debugEnabled
    el.classList.toggle('hidden', !shouldShow)
  }

  const placeInFront = (camPos: THREE.Vector3, camQuat: THREE.Quaternion, dist = DIST): void => {
    const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(camQuat)
    // Keep screen center at true eye level: cam.y is eye height after SLAM init.
    // Slight +0.05 centers it where your eyes naturally rest, not at chest.
    const pos = camPos.clone().addScaledVector(forward, dist)
    pos.y = camPos.y - 0.18 // centered in viewport, not top bar
    group.position.copy(pos)
    // Level and facing: copy camera yaw, keep horizon flat (no pitch roll)
    const e = new THREE.Euler().setFromQuaternion(camQuat, 'YXZ')
    group.rotation.set(0, e.y + Math.PI, 0) // +PI so concave ( -Z bulge ) faces user
    spawned = true
    updatePortalDebug()
  }

  const applySignal = (): void => {
    if (signal <= 1) targetOpacity = 0
    else if (signal === 2) targetOpacity = 0.38
    else if (signal === 3) targetOpacity = 0.96
    else targetOpacity = 1
  }

  scene.add(group)
  group.position.set(0, 0.05, -DIST)
  group.rotation.set(0, Math.PI, 0)

  return {
    group,

    show(spot: FilmSpot) {
      currentSpot = spot
      drawStill(spot)
      screenMat.map = contentTexture
      screenMat.needsUpdate = true
      videoReady = false
      videoFallbackSrc = null
      videoFailed = false
      spawned = false
      groundCue.visible = false
      grid.visible = false
      const wanted = spot.asset.videoUrl ?? ''
      videoFallbackSrc = spot.asset.videoFallbackUrl ?? null
      pendingSrc = wanted || null
      if (signal >= 3 && wanted) ensureVideo(wanted)
      spawnTime = performance.now()
      console.log(`[portal] show ${spot.id} sig:${signal} wanted:${wanted} pending:${pendingSrc}`)
      updatePortalDebug()
    },

    hide() {
      currentSpot = null
      targetOpacity = 0
      videoEl.pause()
      pendingSrc = null
    },

    setSignal(level: PortalSignal) {
      signal = level
      applySignal()
      if (level >= 3 && pendingSrc) ensureVideo(pendingSrc)
      console.log(`[portal] setSignal ${level} -> targetOp:${targetOpacity} pending:${pendingSrc} vis:${group.visible}`)
      updatePortalDebug()
    },

    recenter(cameraPos: THREE.Vector3, cameraQuat: THREE.Quaternion) {
      if (currentSpot) {
        spawned = false
        placeInFront(cameraPos, cameraQuat)
        // grounding cue fades in with the screen
        groundCue.visible = true
        grid.visible = true
      }
    },

    tick(nowMs: number, cameraPos?: THREE.Vector3, cameraQuat?: THREE.Quaternion) {
      // RCA: pose reaching tick() — (d) diagnostic
      if (debugEnabled) {
        const el = document.getElementById('rca-tick')
        if (el) {
          if (cameraPos && cameraQuat) {
            el.textContent = `defined — xyz:${cameraPos.x.toFixed(2)},${cameraPos.y.toFixed(2)},${cameraPos.z.toFixed(2)} quat:${cameraQuat.x.toFixed(2)},${cameraQuat.y.toFixed(2)},${cameraQuat.z.toFixed(2)},${cameraQuat.w.toFixed(2)}`
          } else {
            el.textContent = `UNDEFINED — camPos:${cameraPos ? 'yes' : 'no'} camQuat:${cameraQuat ? 'yes' : 'no'} (XR not started)`
          }
        }
      }
      // World-locked once: place immediately when HOT. Fallback to default pose if XR not yet ready
      // (mobile camera permission pending) — so mobile doesn't stay hidden while desktop shows.
      if (!spawned && currentSpot !== null) {
        if (cameraPos && cameraQuat) {
          placeInFront(cameraPos, cameraQuat)
        } else {
          // Fallback: place at default 2.6m in front of origin, facing user — ensures mobile shows even before XR locks
          group.position.set(0, 0.05, -DIST)
          group.rotation.set(0, Math.PI, 0)
          spawned = true
          updatePortalDebug()
        }
      }

      if (videoReady && !videoFailed && screenMat.map !== videoTexture) {
        screenMat.map = videoTexture
        screenMat.needsUpdate = true
      }

      const hasSpot = currentSpot !== null
      const desiredVisible = hasSpot && spawned && targetOpacity > 0.02
      if (desiredVisible && !group.visible) {
        group.visible = true
        spawnTime = nowMs
        currentOpacity = 0
      }
      if (!desiredVisible && group.visible && targetOpacity < 0.02) {
        currentOpacity += (targetOpacity - currentOpacity) * 0.14
        if (currentOpacity < 0.03) group.visible = false
      }
      // Also hide while waiting for still lock so no world-origin flash
      if (hasSpot && !spawned && group.visible) group.visible = false

      currentOpacity += (targetOpacity - currentOpacity) * 0.09
      const vis = Math.max(0, Math.min(1, currentOpacity))
      screenMat.opacity = vis
      frameMat.opacity = vis * 0.72
      groundCue.material.opacity = vis * 0.18
      for (const material of gridMaterials) material.opacity = vis * 0.07

      const age = (nowMs - spawnTime) / 1000
      const appear = Math.min(1, age * 1.8)
      const ease = 1 - Math.pow(1 - appear, 3)
      group.scale.setScalar(0.9 + 0.1 * ease)
      if (Math.floor(nowMs / 500) % 2 === 0) updatePortalDebug()
    },

    dispose() {
      scene.remove(group)
      group.traverse((obj) => {
        if (obj instanceof THREE.Mesh) {
          obj.geometry.dispose()
          const m = obj.material
          if (Array.isArray(m)) m.forEach((x) => x.dispose())
          else m.dispose()
        }
      })
      contentTexture.dispose()
      videoTexture.dispose()
      screenFrame.geometry.dispose()
      frameMat.dispose()
      videoEl.remove()
    },
  }
}
