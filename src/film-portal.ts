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
  tick(nowMs: number): void
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
  })
  const accentMat = new THREE.MeshStandardMaterial({
    color: MUTED_GOLD,
    metalness: 0.4,
    roughness: 0.4,
    emissive: MUTED_GOLD,
    emissiveIntensity: 0,
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

  // ── screen: film still / clip inside the frame
  const canvas = document.createElement('canvas')
  canvas.width = 512
  canvas.height = 720 // portrait for doorway frame
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
  const screen = new THREE.Mesh(new THREE.PlaneGeometry(W - 0.1, H - 0.22), screenMat)
  screen.position.z = 0.015
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
    ctx.clearRect(0, 0, 512, 720)
    // vignetted film still background — dark with subtle warm top
    const grad = ctx.createLinearGradient(0, 0, 0, 720)
    grad.addColorStop(0, '#1a1f2e')
    grad.addColorStop(0.5, '#0f141e')
    grad.addColorStop(1, '#0b0e16')
    ctx.fillStyle = grad
    ctx.fillRect(0, 0, 512, 720)
    // faint film grain dots for texture (cheap, static)
    ctx.fillStyle = 'rgba(255,255,255,0.04)'
    for (let i = 0; i < 180; i++) {
      const x = Math.random() * 512
      const y = Math.random() * 720
      ctx.fillRect(x, y, 1, 1)
    }
    // year badge top
    ctx.textAlign = 'center'
    ctx.fillStyle = 'rgba(216,196,160,0.9)'
    ctx.font = '11px "Instrument Sans", system-ui, sans-serif'
    ctx.fillText('FILMED HERE  •  CAMPUS  SET', 256, 48)
    // title — large, cream
    ctx.fillStyle = '#F0E6D3'
    let size = 54
    const title = spot.name.toUpperCase()
    do {
      ctx.font = `700 ${size}px "Instrument Sans", system-ui, sans-serif`
      size -= 3
    } while (ctx.measureText(title).width > 440 && size > 28)
    ctx.fillText(title, 256, 360)
    // thin rule
    ctx.strokeStyle = 'rgba(216,196,160,0.35)'
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(180, 384)
    ctx.lineTo(332, 384)
    ctx.stroke()
    // movie below rule
    ctx.fillStyle = 'rgba(234,228,213,0.9)'
    ctx.font = '18px "Instrument Sans", system-ui, sans-serif'
    ctx.fillText(spot.movie.title, 256, 412)
    // blurb — clamp to 3 lines, centered
    ctx.fillStyle = 'rgba(234,228,213,0.55)'
    ctx.font = '12px "Instrument Sans", system-ui, sans-serif'
    const words = spot.movie.blurb.split(' ')
    let line = ''
    let y = 452
    const maxW = 380
    for (const w of words) {
      const test = line ? `${line} ${w}` : w
      if (ctx.measureText(test).width > maxW && line) {
        ctx.fillText(line, 256, y)
        y += 18
        line = w
        if (y > 520) break
      } else {
        line = test
      }
    }
    if (line && y <= 520) ctx.fillText(line, 256, y)
    // bottom meta
    ctx.fillStyle = 'rgba(255,255,255,0.25)'
    ctx.font = '10px ui-monospace, monospace'
    ctx.fillText(`${spot.id.toUpperCase()}  •  WALK AROUND ME`, 256, 680)
    contentTexture.needsUpdate = true
  }

  // ── state
  let currentSpot: FilmSpot | null = null
  let signal: PortalSignal = 0
  let targetOpacity = 0
  let currentOpacity = 0
  let spawnTime = 0

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

    tick(nowMs: number) {
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
