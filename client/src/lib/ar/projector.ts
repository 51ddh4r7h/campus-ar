/**
 * The projector — the scene's guide character, and the source of its light.
 *
 * A small vintage projector on a stand, set off to one side of the screen with
 * its lens aimed at it. Its reels turn while the clip plays and stop when it
 * does, so it reads as the thing running the film rather than a mascot standing
 * next to it. The light beam and the dust drifting through it are thrown from
 * its lens, which is why the character and the beam are one object: take the
 * projector away and the beam has no source.
 *
 * Everything is built from primitives — no meshes to load, nothing to fetch.
 */

import type * as THREE_NS from 'three'

export interface Projector {
  group: THREE_NS.Group
  /** Give up on the model and show the hand-built machine instead. */
  useFallback(): void
  /**
   * Swap the hand-built machine for a real model. Called only once a GLB has
   * actually decoded, so a failed download leaves the primitives in place and
   * the player still gets a projector.
   */
  attachModel(model: THREE_NS.Object3D, opts?: {faceOffsetY?: number; lampY?: number}): void
  /** Advance reels, hover and motes. `lit` fades the beam in and out. */
  update(dtMs: number, lit: number, playing: boolean): void
  dispose(): void
}

const BODY = 0x1d2124
const TRIM = 0xc9a227
const LIGHT = 0xffd9a8

/** Motes drifting in the beam. Enough to read as dust, few enough to be free. */
const MOTE_COUNT = 90

/** A soft round sprite, so motes read as dust rather than as square pixels. */
function moteSprite(THREE: typeof THREE_NS): THREE_NS.Texture {
  const c = document.createElement('canvas')
  c.width = 32
  c.height = 32
  const g = c.getContext('2d')!
  const grad = g.createRadialGradient(16, 16, 0, 16, 16, 16)
  grad.addColorStop(0, 'rgba(255,236,205,1)')
  grad.addColorStop(0.4, 'rgba(255,220,170,0.5)')
  grad.addColorStop(1, 'rgba(255,200,140,0)')
  g.fillStyle = grad
  g.fillRect(0, 0, 32, 32)
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  return t
}

export function createProjector(
  THREE: typeof THREE_NS,
  opts: {
    /** Where the machine stands, in anchor space. */
    at: readonly [number, number, number]
    /** What its lens points at. */
    aim: readonly [number, number, number]
    /** Radius of the beam where it lands. */
    mouthRadius: number
  },
): Projector {
  const group = new THREE.Group()
  const dispose: Array<{dispose(): void}> = []

  const keep = <T extends {dispose(): void}>(x: T): T => {
    dispose.push(x)
    return x
  }

  const bodyMat = keep(
    new THREE.MeshBasicMaterial({color: BODY, transparent: true, opacity: 0, depthTest: false}),
  )
  const trimMat = keep(
    new THREE.MeshBasicMaterial({color: TRIM, transparent: true, opacity: 0, depthTest: false}),
  )
  const lensMat = keep(
    new THREE.MeshBasicMaterial({
      color: LIGHT,
      transparent: true,
      opacity: 0,
      depthTest: false,
      blending: THREE.AdditiveBlending,
    }),
  )

  // ---- the machine ------------------------------------------------------
  const rig = new THREE.Group()
  group.add(rig)

  // The hand-built projector. Kept as the fallback: if the model 404s or the
  // decoder will not start, this is what the player sees instead of nothing.
  // Hidden until we know whether a model is coming. Showing it immediately
  // means every player watches the primitives for a moment and then sees them
  // pop into a real projector — the fallback should be invisible unless it is
  // actually needed.
  const builtIn = new THREE.Group()
  builtIn.visible = false
  rig.add(builtIn)

  const body = new THREE.Mesh(keep(new THREE.BoxGeometry(0.3, 0.2, 0.44)), bodyMat)
  body.renderOrder = 4
  builtIn.add(body)

  // Two reels above the body, side by side, as on a real projector head.
  const reelGeo = keep(new THREE.TorusGeometry(0.105, 0.02, 8, 26))
  const hubGeo = keep(new THREE.CylinderGeometry(0.026, 0.026, 0.042, 12))
  const reels: THREE_NS.Group[] = []
  for (const z of [-0.1, 0.12]) {
    const reel = new THREE.Group()
    const ring = new THREE.Mesh(reelGeo, trimMat)
    const hub = new THREE.Mesh(hubGeo, bodyMat)
    hub.rotation.x = Math.PI / 2
    reel.add(ring, hub)
    reel.position.set(0, 0.2, z)
    reel.renderOrder = 4
    builtIn.add(reel)
    reels.push(reel)
  }

  // Lens barrel, pointing along -Z (toward the screen once the rig is turned).
  const barrel = new THREE.Mesh(
    keep(new THREE.CylinderGeometry(0.055, 0.07, 0.17, 14)),
    bodyMat,
  )
  barrel.rotation.x = Math.PI / 2
  barrel.position.set(0, 0.01, -0.28)
  barrel.renderOrder = 4
  builtIn.add(barrel)

  // The lamp. Deliberately NOT part of `builtIn`: a downloaded model has no
  // light of its own, so this stays when the primitives are swapped out — it
  // is what makes the beam look like it comes from somewhere.
  const lens = new THREE.Mesh(keep(new THREE.CircleGeometry(0.052, 16)), lensMat)
  lens.position.set(0, 0.01, -0.36)
  lens.renderOrder = 7
  rig.add(lens)

  // A short stand, so it reads as standing on the ground rather than floating.
  const post = new THREE.Mesh(keep(new THREE.CylinderGeometry(0.022, 0.022, 0.44, 8)), bodyMat)
  post.position.set(0, -0.32, 0)
  post.renderOrder = 4
  builtIn.add(post)

  // ---- the beam ---------------------------------------------------------
  const LENS_Z = -0.36
  const throwM = Math.max(
    0.8,
    Math.hypot(opts.aim[0] - opts.at[0], opts.aim[1] - opts.at[1], opts.aim[2] - opts.at[2]) +
      LENS_Z,
  )

  const beamMat = keep(
    new THREE.MeshBasicMaterial({
      transparent: true,
      opacity: 0,
      blending: THREE.AdditiveBlending,
      depthTest: false,
      depthWrite: false,
      side: THREE.DoubleSide,
      vertexColors: true,
    }),
  )

  // Apex at the lens, widening to the screen. ConeGeometry puts its apex at
  // +Y, so rotating +90 degrees about X aims it along +Z — the near end — and
  // the mouth lands away from the viewer, on the screen.
  const beamGeo = keep(new THREE.ConeGeometry(opts.mouthRadius, throwM, 24, 12, true))
  paintBeamFalloff(THREE, beamGeo, throwM)
  const beam = new THREE.Mesh(beamGeo, beamMat)
  beam.rotation.x = Math.PI / 2
  beam.position.set(0, 0.01, LENS_Z - throwM / 2)
  beam.renderOrder = 1
  rig.add(beam)

  // ---- dust in the beam -------------------------------------------------
  const motePos = new Float32Array(MOTE_COUNT * 3)
  const moteSeed = new Float32Array(MOTE_COUNT)
  for (let i = 0; i < MOTE_COUNT; i++) {
    moteSeed[i] = Math.random()
    placeMote(i, Math.random())
  }

  /** Drop mote `i` at `t` (0-1) along the beam, on a random radius. */
  function placeMote(i: number, t: number): void {
    const spread = opts.mouthRadius * t
    const a = Math.random() * Math.PI * 2
    const r = Math.sqrt(Math.random()) * spread
    motePos[i * 3] = Math.cos(a) * r
    motePos[i * 3 + 1] = 0.01 + Math.sin(a) * r
    motePos[i * 3 + 2] = LENS_Z - t * throwM
  }

  const moteGeo = keep(new THREE.BufferGeometry())
  moteGeo.setAttribute('position', new THREE.BufferAttribute(motePos, 3))
  const moteTex = keep(moteSprite(THREE))
  const moteMat = keep(
    new THREE.PointsMaterial({
      map: moteTex,
      color: LIGHT,
      size: 0.03,
      transparent: true,
      opacity: 0,
      blending: THREE.AdditiveBlending,
      depthTest: false,
      depthWrite: false,
      sizeAttenuation: true,
    }),
  )
  const motes = new THREE.Points(moteGeo, moteMat)
  motes.renderOrder = 2
  rig.add(motes)

  // ---- placement --------------------------------------------------------
  // Stood where the caller asked, lens turned to face the target — in all three
  // axes. Aiming by yaw alone fires the beam level, so a projector standing
  // below the screen throws its light under it.
  const [ax, ay, az] = opts.at
  rig.position.set(ax, ay, az)
  const aim = new THREE.Vector3(opts.aim[0] - ax, opts.aim[1] - ay, opts.aim[2] - az).normalize()
  rig.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, -1), aim)

  let t = 0

  /** Materials of the loaded model, so it can fade in with everything else. */
  const modelMats: THREE_NS.Material[] = []
  let hasModel = false

  return {
    group,

    useFallback() {
      if (!hasModel) builtIn.visible = true
    },

    attachModel(model, opts) {
      hasModel = true
      builtIn.visible = false

      // A real mesh must depth-test against itself or it renders inside out.
      // Everything else in this scene is a flat composite over the camera feed
      // with depth testing off, so the model is drawn last: it stands nearer
      // than the screen, and should cover it where the two overlap.
      model.traverse((o) => {
        const mesh = o as THREE_NS.Mesh
        if (!mesh.isMesh) return
        mesh.renderOrder = 6
        for (const m of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) {
          m.transparent = true
          m.depthTest = true
          m.depthWrite = true
          m.opacity = 0
          modelMats.push(m)
        }
      })

      // Models arrive facing whichever way the artist left them.
      model.rotation.y += opts?.faceOffsetY ?? 0
      // Sit it on the stand rather than at the rig's origin.
      model.position.y -= 0.1

      // Put the lamp at the model's own lens, and open the beam from there.
      const lampY = opts?.lampY ?? 0.16
      lens.position.set(0, lampY, LENS_Z)
      beam.position.set(0, lampY, LENS_Z - throwM / 2)
      for (let i = 0; i < MOTE_COUNT; i++) motePos[i * 3 + 1] = (motePos[i * 3 + 1] ?? 0) + lampY - 0.01
      moteGeo.getAttribute('position').needsUpdate = true
      rig.add(model)
    },

    update(dtMs, lit, playing) {
      t += dtMs
      const ease = Math.max(0, Math.min(1, lit))

      bodyMat.opacity = ease * 0.95
      trimMat.opacity = ease * 0.95
      lensMat.opacity = ease
      for (const m of modelMats) m.opacity = ease
      beamMat.opacity = ease * 0.42
      moteMat.opacity = ease * 0.7

      // Reels turn only while the film is running.
      if (playing) {
        const spin = (dtMs / 1000) * 2.4
        for (const r of reels) r.rotation.z -= spin
      }

      // A slow hover, and a flicker on the lamp — a projector is never quite still.
      rig.position.y = ay + Math.sin(t / 1200) * 0.012
      lensMat.opacity = ease * (0.82 + Math.sin(t / 90) * 0.06 + Math.sin(t / 37) * 0.04)

      // Motes drift toward the screen and recycle at the lens.
      for (let i = 0; i < MOTE_COUNT; i++) {
        const z = motePos[i * 3 + 2]! - (dtMs / 1000) * (0.05 + moteSeed[i]! * 0.12)
        if (z < LENS_Z - throwM) placeMote(i, 0.02)
        else motePos[i * 3 + 2] = z
      }
      moteGeo.getAttribute('position').needsUpdate = true
    },

    dispose() {
      for (const d of dispose) d.dispose()
      modelMats.length = 0
    },
  }
}

/**
 * A light shaft is brightest at the lens and gone by the time it lands. With
 * additive blending a vertex's colour *is* its contribution, so darkening the
 * mesh along its length fades the beam out without a second draw or a shader.
 */
function paintBeamFalloff(
  THREE: typeof THREE_NS,
  geo: THREE_NS.BufferGeometry,
  lengthM: number,
): void {
  const pos = geo.getAttribute('position')
  const colors = new Float32Array(pos.count * 3)
  for (let i = 0; i < pos.count; i++) {
    // +Y is the apex (the lens end) before the mesh is rotated into place.
    const t = 0.5 - pos.getY(i) / lengthM
    const fade = Math.max(0, 1 - t * 0.82) ** 1.5
    colors[i * 3] = 1.0 * fade
    colors[i * 3 + 1] = 0.85 * fade
    colors[i * 3 + 2] = 0.66 * fade
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3))
}
