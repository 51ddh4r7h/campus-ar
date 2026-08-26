/**
 * Film Set Portal — the centerpiece (§11 "first proof this is AR" + user portal spec).
 *
 * A life-size frame standing on the ground, world-anchored. Inside the frame:
 * an animated film still (canvas) that becomes the clip when `public/clips/<id>.mp4`
 * exists. The user can walk around it — it stays attached to the physical world.
 *
 * Lifecycle:
 *  - hidden until HOT (signal 3)
 *  - HOT: fades/scales in, standing, subtle breathe
 *  - YOU'RE CLOSE / ON SET: fully solid + clip plays
 *  - REVEAL: flashes, frame glows, card already handled by reveal.ts
 */

import * as THREE from 'three'
import type {FilmSpot} from './data/spots'

const CREAM = 0xeae4d5
const NIGHT = 0x0b0e16
const MUTED_GOLD = 0xd8c4a0

export type PortalSignal = 0 | 1 | 2 | 3 | 4

export interface FilmPortal {
  readonly group: THREE.Group
  show(spot: FilmSpot): void
  hide(): void
  setSignal(level: PortalSignal): void
  tick(nowMs: number, cameraPos?: THREE.Vector3): void
  dispose(): void
}

export function createFilmPortal(scene: THREE.Scene): FilmPortal {
  const group = new THREE.Group()
  group.visible = false
  ;(group as unknown as {renderOrder: number}).renderOrder = 10

  // ── frame: doorway proportions, standing on ground
  // Outer size ~1.32 × 1.9, border 0.08 thick, bottom sits on ground (y = -1.4 local → world ground).
  const frameMat = new THREE.MeshStandardMaterial({
    color: CREAM,
    metalness: 0.15,
    roughness: 0.55,
    transparent: true,
  })
  const accentMat = new THREE.MeshStandardMaterial({
    color: MUTED_GOLD,
    metalness: 0.4,
    roughness: 0.4,
    emissive: MUTED_GOLD,
    emissiveIntensity: 0,
    transparent: true,
  })

  const W = 1.32
  const H = 1.9
  const T = 0.07
  const B = 0.09

  // Top / bottom / left / right rails
  const top = new THREE.Mesh(new THREE.BoxGeometry(W + B * 2, B, T), frameMat)
  top.position.y = H / 2 - B / 2
  const bottom = new THREE.Mesh(new THREE.BoxGeometry(W + B * 2, B, T), frameMat)
  bottom.position.y = -H / 2 + B / 2
  const left = new THREE.Mesh(new THREE.BoxGeometry(B, H - B * 2, T), frameMat)
  left.position.x = -W / 2 - B / 2
  const right = new THREE.Mesh(new THREE.BoxGeometry(B, H - B * 2, T), frameMat)
  right.position.x = W / 2 + B / 2
  group.add(top, bottom, left, right)

  // Thin inner accent line (muted gold hairline)
  const innerFrame = new THREE.Mesh(
    new THREE.BoxGeometry(W + 0.02, H - 0.08, 0.02),
    new THREE.MeshBasicMaterial({color: MUTED_GOLD, transparent: true, opacity: 0.35}),
  )
  // Use edges: just a wireframe look via 4 thin planes? Keep simple: one inner rect as line loop via LineSegments
  // Instead, draw a simple inner border with 4 thin boxes at low opacity
  innerFrame.visible = false // placeholder — keep accent via emissive instead
  group.add(innerFrame)

  // Backing (dark interior, blocks camera behind)
  const backing = new THREE.Mesh(
    new THREE.PlaneGeometry(W, H - B * 2),
    new THREE.MeshBasicMaterial({color: NIGHT, transparent: true, opacity: 0.96, side: THREE.DoubleSide}),
  )
  backing.position.z = -0.02
  group.add(backing)

  // ── screen: cinemascope film still / clip inside the doorway
  const canvas = document.createElement('canvas')
  canvas.width = 640
  canvas.height = 268 // 2.39:1 scope
  const ctx = canvas.getContext('2d')!
  const contentTexture = new THREE.CanvasTexture(canvas)
  contentTexture.colorSpace = THREE.SRGBColorSpace

  const videoEl = document.createElement('video')
  videoEl.muted = true
  videoEl.loop = true
  videoEl.playsInline = true
  videoEl.setAttribute('playsinline', '')
  videoEl.style.display = 'none'
  document.body.appendChild(videoEl)
  let videoReady = false
  let videoFailed = false
  let videoSrc = ''
  videoEl.addEventListener('loadeddata', () => {
    videoReady = true
  })
  videoEl.addEventListener('error', () => {
    videoFailed = true
  })
  const videoTexture = new THREE.VideoTexture(videoEl)
  videoTexture.colorSpace = THREE.SRGBColorSpace

  const screenMat = new THREE.MeshBasicMaterial({
    map: contentTexture,
    transparent: true,
    opacity: 1,
  })
  // Cinemascope screen — centered in the doorway at eye level
  const screen = new THREE.Mesh(new THREE.PlaneGeometry(1.15, 0.48), screenMat)
  screen.position.set(0, 0.18, 0.02)
  group.add(screen)

  // Ground shadow under the portal feet
  const groundShadow = new THREE.Mesh(
    new THREE.CircleGeometry(0.55, 24),
    new THREE.MeshBasicMaterial({color: 0x000000, transparent: true, opacity: 0.28, depthWrite: false}),
  )
  groundShadow.rotation.x = -Math.PI / 2
  groundShadow.position.y = -H / 2 + 0.015
  group.add(groundShadow)

  // Subtle base plinth (two small feet) for "standing on ground" read
  const plinthGeo = new THREE.BoxGeometry(0.22, 0.04, 0.14)
  const plinthMat = new THREE.MeshStandardMaterial({color: 0x1a1f2e, roughness: 0.7})
  const footL = new THREE.Mesh(plinthGeo, plinthMat)
  footL.position.set(-W / 2 + 0.14, -H / 2 + 0.02, 0.02)
  const footR = new THREE.Mesh(plinthGeo, plinthMat)
  footR.position.set(W / 2 - 0.14, -H / 2 + 0.02, 0.02)
  group.add(footL, footR)

  // ── drawing helpers
  const drawStill = (spot: FilmSpot): void => {
    ctx.clearRect(0, 0, 640, 268)
    // vignetted scope background
    const grad = ctx.createLinearGradient(0, 0, 0, 268)
    grad.addColorStop(0, '#1a1f2e')
    grad.addColorStop(0.5, '#0f141e')
    grad.addColorStop(1, '#0b0e16')
    ctx.fillStyle = grad
    ctx.fillRect(0, 0, 640, 268)
    ctx.fillStyle = 'rgba(255,255,255,0.04)'
    for (let i = 0; i < 120; i++) {
      const x = Math.random() * 640
      const y = Math.random() * 268
      ctx.fillRect(x, y, 1, 1)
    }
    ctx.textAlign = 'center'
    ctx.fillStyle = 'rgba(216,196,160,0.9)'
    ctx.font = '9px "Instrument Sans", system-ui, sans-serif'
    ctx.fillText('FILMED HERE  •  CAMPUS  SET', 320, 42)
    ctx.fillStyle = '#F0E6D3'
    let size = 42
    const title = spot.name.toUpperCase()
    do {
      ctx.font = `700 ${size}px "Instrument Sans", system-ui, sans-serif`
      size -= 2
    } while (ctx.measureText(title).width > 520 && size > 22)
    ctx.fillText(title, 320, 132)
    ctx.strokeStyle = 'rgba(216,196,160,0.35)'
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(250, 150)
    ctx.lineTo(390, 150)
    ctx.stroke()
    ctx.fillStyle = 'rgba(234,228,213,0.9)'
    ctx.font = '15px "Instrument Sans", system-ui, sans-serif'
    ctx.fillText(spot.movie.title, 320, 174)
    ctx.fillStyle = 'rgba(234,228,213,0.5)'
    ctx.font = '11px "Instrument Sans", system-ui, sans-serif'
    // single-line blurb, truncated
    let blurb = spot.movie.blurb
    if (ctx.measureText(blurb).width > 560) {
      while (ctx.measureText(`${blurb}…`).width > 560 && blurb.length > 20) blurb = blurb.slice(0, -1)
      blurb += '…'
    }
    ctx.fillText(blurb, 320, 206)
    ctx.fillStyle = 'rgba(255,255,255,0.22)'
    ctx.font = '8px ui-monospace, monospace'
    ctx.fillText(`${spot.id.toUpperCase()}  •  WALK AROUND ME`, 320, 248)
    contentTexture.needsUpdate = true
  }

  // ── state
  let currentSpot: FilmSpot | null = null
  let signal: PortalSignal = 0
  let targetOpacity = 0
  let currentOpacity = 0
  let spawnTime = 0
  let spawned = false

  const placeAround = (cameraPos: THREE.Vector3): void => {
    const forward = new THREE.Vector3(0, 0, -1)
    group.position.set(cameraPos.x + forward.x * 1.7, -0.42, cameraPos.z + forward.z * 1.7)
    spawned = true
  }

  const applySignal = (): void => {
    // COLD/WARM: hidden, HOT: fade in, YOU'RE CLOSE: solid, FOUND: hold solid
    if (signal <= 1) targetOpacity = 0
    else if (signal === 2) targetOpacity = 0.35
    else if (signal === 3) targetOpacity = 0.92
    else targetOpacity = 1
  }

  scene.add(group)
  // Place the portal ahead, standing on the ground plane (world origin = where tracking locked).
  // Camera starts at (0,0,0) looking -Z; portal 1.7m ahead, feet on the ground.
  group.position.set(0, -0.42, -1.7)
  group.rotation.y = 0

  return {
    group,

    show(spot: FilmSpot) {
      currentSpot = spot
      drawStill(spot)
      screenMat.map = contentTexture
      screenMat.needsUpdate = true
      videoReady = false
      videoFailed = false
      spawned = false
      const wanted = spot.asset.videoUrl ?? ''
      if (wanted && videoSrc !== wanted) {
        videoSrc = wanted
        videoEl.src = wanted
        videoEl.load()
      }
      if (wanted) {
        videoEl.play().catch(() => undefined)
      }
      // Keep canvas still until video loads; swap when ready is handled in tick.
      spawnTime = performance.now()
    },

    hide() {
      currentSpot = null
      targetOpacity = 0
    },

    setSignal(level: PortalSignal) {
      signal = level
      applySignal()
      // Emissive on frame for heat
      const intensity = level <= 1 ? 0 : level === 2 ? 0.15 : level === 3 ? 0.45 : 0.6
      ;(accentMat as THREE.MeshStandardMaterial).emissiveIntensity = intensity
    },

    tick(nowMs: number, cameraPos?: THREE.Vector3) {
      if (!spawned && currentSpot !== null && cameraPos) placeAround(cameraPos)

      // Swap canvas → video once the clip is ready (seamless).
      if (videoReady && !videoFailed && screenMat.map !== videoTexture) {
        screenMat.map = videoTexture
        screenMat.needsUpdate = true
      }

      // Visibility is driven by targetOpacity (signal) + whether we have a spot.
      const hasSpot = currentSpot !== null
      const desiredVisible = hasSpot && targetOpacity > 0.02
      if (desiredVisible && !group.visible) {
        group.visible = true
        spawnTime = nowMs
        currentOpacity = 0
      }
      if (!desiredVisible && group.visible && targetOpacity < 0.02) {
        // fade out, then hide to avoid popping
        currentOpacity += (targetOpacity - currentOpacity) * 0.12
        if (currentOpacity < 0.03) group.visible = false
      }

      // Glide opacity + scale for "materialising" feel
      currentOpacity += (targetOpacity - currentOpacity) * 0.08
      const vis = Math.max(0, Math.min(1, currentOpacity))
      // Apply to all frame meshes' opacity via material (frame mats are opaque; fade via group scale + backing)
      backing.material.opacity = 0.96 * vis
      groundShadow.material.opacity = 0.28 * vis
      screenMat.opacity = vis
      // Scale breathes slightly on HOT
      const age = (nowMs - spawnTime) / 1000
      const appear = Math.min(1, age * 2.2) // first 0.45s
      const ease = 1 - Math.pow(1 - appear, 3)
      const breathe = 1 + Math.sin(nowMs * 0.0009) * 0.008 * (signal >= 3 ? 1 : 0.3)
      group.scale.setScalar((0.88 + 0.12 * ease) * breathe)
      // Subtle Y bob when hot
      group.position.y = -0.15 + Math.sin(nowMs * 0.001) * 0.015 * (signal >= 3 ? 1 : 0.2)
      // Gentle flicker on frame accent when hot
      if (signal >= 3) {
        const flicker = 0.45 + Math.sin(nowMs * 0.004) * 0.12
        ;(accentMat as THREE.MeshStandardMaterial).emissiveIntensity = flicker
      }
    },

    dispose() {
      scene.remove(group)
      group.traverse((obj) => {
        if (obj instanceof THREE.Mesh) {
          obj.geometry.dispose()
          const m = obj.material
          if (Array.isArray(m)) m.forEach((x) => x.dispose())
          else (m as THREE.Material).dispose()
        }
      })
      contentTexture.dispose()
      videoTexture.dispose()
      videoEl.remove()
    },
  }
}
