/**
 * The signature piece: an in-world film clapperboard that claps shut and throws
 * a golden spotlight cone upward, anchored in world space when a spot is found.
 *
 * Respects `prefers-reduced-motion`: skips the clap and presents statically.
 */

import * as THREE from 'three'
import type {FilmSpot} from './data/spots'

// Designed to feel like marquee brass + cinema-navy board, not default materials.
const NIGHT = 0x0d1320
const BRASS = 0xb97e1e
const GOLD = 0xf3b93f
const CHALK = 0xeae4d5
const CREAM = 0xffe9ae

type Phase = 'idle' | 'rise' | 'clap' | 'flash' | 'present' | 'done'

const OPEN_ANGLE = -0.62 // arm resting tilted back
const CLOSED_ANGLE = 0.05 // arm flat against the board

export interface RevealDevice {
  group: THREE.Group
  /** Fired once, shortly after the clap, to open the DOM info panel. */
  onOpen: ((spot: FilmSpot) => void) | null
  show(spot: FilmSpot): void
  reset(): void
  tick(nowMs: number): void
}

export function createRevealDevice(scene: THREE.Scene): RevealDevice {
  const prefersReduced =
    globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false

  // ---------------------------------------------------------------- clip screen
  // When the spot ships a movie clip (public/clips/<id>.mp4) it plays on a
  // screen behind the slate after the clap. Missing file → board-only reveal.
  const clipVideo = document.createElement('video')
  clipVideo.muted = true
  clipVideo.loop = true
  clipVideo.playsInline = true
  clipVideo.setAttribute('playsinline', '')
  clipVideo.style.display = 'none'
  document.body.appendChild(clipVideo)

  let clipReady = false
  let clipFailed = false
  let clipSrc = ''
  clipVideo.addEventListener('loadeddata', () => {
    clipReady = true
  })
  clipVideo.addEventListener('error', () => {
    clipFailed = true
  })

  const clipTexture = new THREE.VideoTexture(clipVideo)
  clipTexture.colorSpace = THREE.SRGBColorSpace
  const clipScreen = new THREE.Mesh(
    new THREE.PlaneGeometry(1.6, 0.9),
    new THREE.MeshBasicMaterial({map: clipTexture, transparent: true, opacity: 0, toneMapped: false}),
  )
  clipScreen.position.set(0, 0.18, -0.35)
  clipScreen.visible = false

  // ------------------------------------------------------------------ slate
  const slate = new THREE.Group()

  const boardMat = new THREE.MeshStandardMaterial({color: NIGHT, metalness: 0.55, roughness: 0.42})
  const stripMat = new THREE.MeshStandardMaterial({
    color: BRASS,
    emissive: GOLD,
    emissiveIntensity: 0.4,
    metalness: 0.85,
    roughness: 0.3,
  })
  const armMat = new THREE.MeshStandardMaterial({color: 0x161d2d, metalness: 0.5, roughness: 0.5})
  const stripeMat = new THREE.MeshStandardMaterial({color: CHALK, metalness: 0.1, roughness: 0.6})

  // Slate body.
  const board = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.56, 0.04), boardMat)
  slate.add(board)

  // Brass top rail (carries the "lamp" feel).
  const rail = new THREE.Mesh(new THREE.BoxGeometry(0.96, 0.13, 0.05), stripMat)
  rail.position.y = 0.345
  slate.add(rail)

  // Hinge pin.
  const hinge = new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.028, 1.0, 14), stripMat)
  hinge.rotation.z = Math.PI / 2
  hinge.position.y = 0.35
  hinge.position.z = 0.02
  slate.add(hinge)

  // The clapper arm, hinged at the top of the board.
  const arm = new THREE.Group()
  const armMesh = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.56, 0.022), armMat)
  armMesh.geometry.translate(0, -0.28, 0) // pivot at the top edge
  armMesh.position.z = 0.045
  arm.add(armMesh)

  // Classic slate stripes on the arm face.
  for (let i = 0; i < 5; i++) {
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.04, 0.006), stripeMat)
    stripe.position.y = -0.34 - i * 0.105 // below the hinge line, upper arm area
    stripe.position.z = 0.056
    arm.add(stripe)
  }
  arm.position.y = 0.35
  arm.position.z = 0.03
  arm.rotation.x = OPEN_ANGLE
  slate.add(arm)

  // Film-strip notches along the bottom edge — the "reel" hint.
  for (let i = 0; i < 9; i++) {
    const notch = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.05, 0.012), stripMat)
    notch.position.set(-0.36 + i * 0.09, -0.305, 0.026)
    slate.add(notch)
  }

  slate.scale.setScalar(0.001)
  slate.visible = false

  // ----------------------------------------------------------- light effect
  // Spotlight cone (apex set into the board top, flaring upward).
  const cone = new THREE.Mesh(
    new THREE.ConeGeometry(0.62, 2.6, 24, 1, true),
    new THREE.MeshBasicMaterial({
      color: GOLD,
      transparent: true,
      opacity: 0,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
    }),
  )
  cone.rotation.x = Math.PI
  cone.position.y = 1.95
  slate.add(cone)

  // Warm ground disc so the slate feels seated in the room.
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(0.55, 0.78, 36),
    new THREE.MeshBasicMaterial({
      color: GOLD,
      transparent: true,
      opacity: 0,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
    }),
  )
  ring.rotation.x = -Math.PI / 2
  ring.position.y = 0.001
  slate.add(ring)

  // Warm camera-flash burst.
  const flash = new THREE.Mesh(
    new THREE.IcosahedronGeometry(0.3, 2),
    new THREE.MeshBasicMaterial({
      color: 0xfff3d0,
      transparent: true,
      opacity: 0,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    }),
  )
  flash.position.set(0, 0.4, 0.35)
  slate.add(flash)

  scene.add(slate)
  slate.add(clipScreen)

  // ── FilmFrame title card: cinematic history inserted into the room (§18).
  const cardCanvas = document.createElement('canvas')
  cardCanvas.width = 512
  cardCanvas.height = 288
  const cardCtx = cardCanvas.getContext('2d')!
  const cardTexture = new THREE.CanvasTexture(cardCanvas)
  cardTexture.colorSpace = THREE.SRGBColorSpace
  const cardMaterial = new THREE.MeshBasicMaterial({map: cardTexture, transparent: true, opacity: 0})
  const card = new THREE.Mesh(new THREE.PlaneGeometry(1.02, 0.574), cardMaterial)
  card.position.set(0, 0.72, 0.08)
  card.visible = false
  slate.add(card)

  const drawCard = (s: FilmSpot): void => {
    const ctx = cardCtx
    ctx.fillStyle = '#0B0E16'
    ctx.fillRect(0, 0, 512, 288)
    ctx.strokeStyle = '#EAE4D5'
    ctx.lineWidth = 10
    ctx.strokeRect(9, 9, 494, 270)
    ctx.strokeStyle = 'rgba(243, 185, 63, 0.85)'
    ctx.lineWidth = 2
    ctx.strokeRect(30, 30, 452, 228)
    ctx.textAlign = 'center'
    ctx.fillStyle = '#F3B93F'
    ctx.font = '26px "Bebas Neue", Impact, sans-serif'
    ctx.fillText('F I L M E D   H E R E', 256, 84)
    let size = 62
    ctx.fillStyle = '#FFE9AE'
    do {
      ctx.font = `${size}px "Bebas Neue", Impact, sans-serif`
      size -= 4
    } while (ctx.measureText(s.name.toUpperCase()).width > 430 && size > 30)
    ctx.fillText(s.name.toUpperCase(), 256, 158)
    ctx.fillStyle = '#EAE4D5'
    ctx.font = '32px "Bebas Neue", Impact, sans-serif'
    ctx.fillText(s.movie.title.toUpperCase(), 256, 214)
    cardTexture.needsUpdate = true
  }

  // ── film-strip particles: burst outward on the clap (§17 step 5).
  interface Strip {
    mesh: THREE.Mesh
    vel: THREE.Vector3
    spin: number
    life: number
  }
  const strips: Strip[] = []
  const stripGeo = new THREE.PlaneGeometry(0.02, 0.075)
  for (let i = 0; i < 24; i++) {
    const mat = new THREE.MeshBasicMaterial({
      color: i % 3 === 0 ? CREAM : GOLD,
      transparent: true,
      opacity: 0,
      side: THREE.DoubleSide,
    })
    const strip = new THREE.Mesh(stripGeo, mat)
    strip.visible = false
    slate.add(strip)
    strips.push({mesh: strip, vel: new THREE.Vector3(), spin: 0, life: 0})
  }

  const burstStrips = (): void => {
    for (const strip of strips) {
      const angle = Math.random() * Math.PI * 2
      const speed = 0.5 + Math.random() * 0.9
      strip.vel.set(Math.cos(angle) * speed, 0.8 + Math.random() * 0.7, Math.sin(angle) * speed * 0.4)
      strip.spin = (Math.random() - 0.5) * 6
      strip.life = 1
      strip.mesh.position.set(0, 0.45, 0.05)
      strip.mesh.rotation.set(0, 0, Math.random() * Math.PI)
      strip.mesh.visible = true
      ;(strip.mesh.material as THREE.MeshBasicMaterial).opacity = 1
    }
  }

  // ---------------------------------------------------------------- timeline
  let phase: Phase = 'idle'
  let startedAt = 0
  let spot: FilmSpot | null = null
  let openedCalled = false
  const OPEN_AT = 1250 // after the clap, when to open the DOM panel

  const device: RevealDevice = {
    group: slate,
    onOpen: null,

    show(s: FilmSpot) {
      spot = s
      openedCalled = false
      startedAt = performance.now()
      slate.visible = true
      slate.position.set(0, 0, 0)
      slate.rotation.set(0, 0, 0)
      slate.scale.setScalar(prefersReduced ? 1 : 0.001)
      arm.rotation.x = prefersReduced ? CLOSED_ANGLE : OPEN_ANGLE
      cone.material.opacity = prefersReduced ? 0.28 : 0
      ring.material.opacity = prefersReduced ? 0.18 : 0
      flash.material.opacity = 0
      clipScreen.visible = false
      ;(clipScreen.material as THREE.MeshBasicMaterial).opacity = 0
      card.visible = false
      cardMaterial.opacity = 0
      for (const strip of strips) strip.mesh.visible = false
      clipReady = false
      clipFailed = false
      drawCard(s)
      const wanted = s.asset.videoUrl ?? ''
      if (wanted && clipSrc !== wanted) {
        clipSrc = wanted
        clipVideo.src = wanted
        clipVideo.load()
      }
      if (wanted) clipVideo.play().catch(() => undefined)
      phase = prefersReduced ? 'flash' : 'rise'
    },

    reset() {
      phase = 'idle'
      slate.visible = false
      cone.material.opacity = 0
      ring.material.opacity = 0
      flash.material.opacity = 0
      clipScreen.visible = false
      ;(clipScreen.material as THREE.MeshBasicMaterial).opacity = 0
      card.visible = false
      cardMaterial.opacity = 0
      for (const strip of strips) strip.mesh.visible = false
      clipVideo.pause()
      spot = null
    },

    tick(nowMs: number) {
      if (phase === 'idle' || phase === 'done' || !spot) return
      const t = nowMs - startedAt

      const easeOutBack = (p: number): number => {
        const c1 = 1.70158
        const c3 = c1 + 1
        const x = p - 1
        return 1 + c3 * x ** 3 + c1 * x ** 2
      }
      const easeOutQuad = (p: number): number => 1 - (1 - p) * (1 - p)

      switch (phase) {
        case 'rise': {
          const p = Math.min(1, t / 720)
          slate.scale.setScalar(0.001 + (1 - 0.001) * easeOutBack(p))
          slate.position.y = -0.4 * (1 - easeOutQuad(p))
          if (p >= 1) {
            phase = 'clap'
            startedAt = nowMs
          }
          break
        }
        case 'clap': {
          // Two quick strikes: down, up, down.
          let a = OPEN_ANGLE
          if (t < 110) a = OPEN_ANGLE + (CLOSED_ANGLE - OPEN_ANGLE) * (t / 110)
          else if (t < 190) a = CLOSED_ANGLE + (OPEN_ANGLE - CLOSED_ANGLE) * ((t - 110) / 80)
          else if (t < 300) a = OPEN_ANGLE + (CLOSED_ANGLE - OPEN_ANGLE) * ((t - 190) / 110)
          else a = CLOSED_ANGLE
          arm.rotation.x = a
          if (t >= 300) {
            burstStrips()
            phase = 'flash'
            startedAt = nowMs
          }
          break
        }
        case 'flash': {
          // Film strips fly outward with gravity, fading as they land.
          for (const strip of strips) {
            if (!strip.mesh.visible) continue
            strip.vel.y -= 0.004 * 16
            strip.mesh.position.addScaledVector(strip.vel, 1)
            strip.mesh.rotation.x += strip.spin
            strip.life -= 16 / 900
            ;(strip.mesh.material as THREE.MeshBasicMaterial).opacity = Math.max(0, strip.life)
            if (strip.life <= 0) strip.mesh.visible = false
          }
          const p = t / 320
          flash.material.opacity = Math.max(0, Math.sin(Math.PI * p)) * 0.9
          if (p >= 1 && !openedCalled) {
            phase = 'present'
            startedAt = nowMs
          }
          break
        }
        case 'present': {
          // Strips keep flying while the board presents.
          for (const strip of strips) {
            if (!strip.mesh.visible) continue
            strip.vel.y -= 0.004 * 16
            strip.mesh.position.addScaledVector(strip.vel, 1)
            strip.mesh.rotation.x += strip.spin
            strip.life -= 16 / 900
            ;(strip.mesh.material as THREE.MeshBasicMaterial).opacity = Math.max(0, strip.life)
            if (strip.life <= 0) strip.mesh.visible = false
          }
          // The board presents: cone blooms, soft float, panel opens. The
          // movie clip screen (if the clip loaded) fades in behind the board,
          // and the FilmFrame title card rises above it.
          const p = Math.min(1, t / 1600)
          cone.material.opacity = 0.08 + 0.42 * easeOutQuad(p)
          ring.material.opacity = 0.05 + 0.22 * easeOutQuad(p)
          slate.rotation.z = Math.sin(t * 0.0016) * 0.045
          slate.position.y = Math.sin(t * 0.0022) * 0.03
          if (clipReady && !clipFailed) {
            if (!clipScreen.visible) {
              clipScreen.visible = true
              clipVideo.play().catch(() => undefined)
            }
            const cp = Math.min(1, t / 700)
            ;(clipScreen.material as THREE.MeshBasicMaterial).opacity = easeOutQuad(cp)
            clipScreen.position.y = 0.18 + 0.06 * easeOutQuad(cp)
          }
          if (t > 250) {
            card.visible = true
            const kp = Math.min(1, (t - 250) / 650)
            cardMaterial.opacity = easeOutQuad(kp)
            card.position.y = 0.72 + 0.05 * easeOutQuad(kp)
          }
          if (!openedCalled && t >= OPEN_AT) {
            openedCalled = true
            device.onOpen?.(spot)
          }
          if (p >= 1) phase = 'done'
          break
        }
        default:
          break
      }
    },
  }

  slate.traverse((obj) => {
    if (obj !== slate) obj.userData.revealPart = true
  })

  return device
}