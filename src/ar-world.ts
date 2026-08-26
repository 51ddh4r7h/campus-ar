/**
 * ARWorld — the world-space visual layer for the hunt (spec §12, §36, §37).
 *
 * Owns every Three.js object that lives IN the tracked world:
 *   HuntAnchor: film reel + ground shadow (+ label anchor exported to ar.ts)
 *   SetMarkers: a ring of film diamonds that materialise on HOT
 *
 * Signal-reactive by design (§15): COLD dims + slows the reel, WARM brightens,
 * HOT makes it blaze and spawns the marker ring, FOUND hands the moment to the
 * reveal device. The game state stays in hunt.ts/proximity.ts — this layer
 * only renders it.
 *
 * All objects are anchored relative to where tracking locked (the world
 * origin), so moving the phone visibly keeps them attached to the real world.
 */
import * as THREE from 'three'

export type SignalLevel = 0 | 1 | 2 | 3 | 4

const GOLD = new THREE.Color('#F3B93F')
const BRASS = new THREE.Color('#B97E1E')
const CREAM = new THREE.Color('#FFE9AE')

export interface ArWorld {
  /** The reel's anchor — project this for the spatial label. */
  readonly anchor: THREE.Object3D
  /** World-space marker ring group (for future effects). */
  readonly markers: THREE.Group
  setSignal(level: SignalLevel): void
  /** Per-frame animation; cameraPos is the tracked device position. */
  tick(nowMs: number, cameraPos: THREE.Vector3): void
  /** Re-centre the hunt anchor around a fresh world position. */
  recenter(cameraPos: THREE.Vector3): void
  reset(): void
  dispose(): void
}

export function createArWorld(scene: THREE.Scene): ArWorld {
  const group = new THREE.Group()
  scene.add(group)

  // ────────────────────────────────────────────── film reel (HuntAnchor)
  const anchor = new THREE.Group()
  group.add(anchor)

  const reel = new THREE.Group()
  anchor.add(reel)

  const metal = new THREE.MeshStandardMaterial({
    color: BRASS,
    metalness: 0.65,
    roughness: 0.32,
    emissive: GOLD,
    emissiveIntensity: 0.12,
  })
  const creamMat = new THREE.MeshStandardMaterial({
    color: CREAM,
    metalness: 0.2,
    roughness: 0.5,
    emissive: CREAM,
    emissiveIntensity: 0.08,
  })

  // Rim: two large washers (the reel's flanges).
  const flangeGeo = new THREE.CylinderGeometry(0.16, 0.16, 0.018, 40)
  const flangeA = new THREE.Mesh(flangeGeo, metal)
  flangeA.rotation.x = Math.PI / 2
  flangeA.position.z = -0.045
  const flangeB = new THREE.Mesh(flangeGeo, metal)
  flangeB.rotation.x = Math.PI / 2
  flangeB.position.z = 0.045
  reel.add(flangeA, flangeB)

  // Hub + spokes.
  const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.1, 24), creamMat)
  hub.rotation.x = Math.PI / 2
  reel.add(hub)
  const spokeGeo = new THREE.BoxGeometry(0.24, 0.03, 0.03)
  for (let i = 0; i < 3; i++) {
    const spoke = new THREE.Mesh(spokeGeo, creamMat)
    spoke.rotation.z = (i * Math.PI) / 3
    reel.add(spoke)
  }

  // Halo: soft amber ring that breathes with signal heat.
  const halo = new THREE.Mesh(
    new THREE.TorusGeometry(0.21, 0.006, 8, 64),
    new THREE.MeshBasicMaterial({color: GOLD, transparent: true, opacity: 0.22}),
  )
  anchor.add(halo)

  // Ground shadow: soft contact cue on the floor.
  const shadow = new THREE.Mesh(
    new THREE.CircleGeometry(0.2, 32),
    new THREE.MeshBasicMaterial({color: 0x000000, transparent: true, opacity: 0.32, depthWrite: false}),
  )
  shadow.rotation.x = -Math.PI / 2
  anchor.add(shadow)

  // ────────────────────────────────────────────── set markers (the "trail")
  // A ring of film diamonds that materialises around the player on HOT —
  // the set itself becomes legible in the world (spec §13, §16: no navigation).
  const markers = new THREE.Group()
  group.add(markers)
  const markerGeo = new THREE.OctahedronGeometry(0.055)
  const markerMats: THREE.MeshStandardMaterial[] = []
  const RING_RADIUS = 1.35
  for (let i = 0; i < 8; i++) {
    const mat = new THREE.MeshStandardMaterial({
      color: GOLD,
      metalness: 0.4,
      roughness: 0.35,
      emissive: GOLD,
      emissiveIntensity: 0,
      transparent: true,
      opacity: 0,
    })
    markerMats.push(mat)
    const marker = new THREE.Mesh(markerGeo, mat)
    const angle = (i / 8) * Math.PI * 2
    marker.position.set(Math.cos(angle) * RING_RADIUS, -1.15, Math.sin(angle) * RING_RADIUS)
    marker.visible = false
    markers.add(marker)
  }

  // ────────────────────────────────────────────── placement + state
  let signal: SignalLevel = 0
  let spawned = false

  const placeAround = (cameraPos: THREE.Vector3): void => {
    // Anchor the reel ~1.2 m ahead at eye-ish height; markers ring the player.
    const forward = new THREE.Vector3(0, 0, -1)
    anchor.position.set(cameraPos.x + forward.x * 1.2, -0.25, cameraPos.z + forward.z * 1.2)
    shadow.position.y = -1.15 - anchor.position.y + 0.02
    markers.position.set(cameraPos.x, 0, cameraPos.z)
    spawned = true
  }

  const SIGNAL_TUNING: Record<SignalLevel, {emissive: number; halo: number; pulseHz: number; markerOpacity: number}> = {
    0: {emissive: 0.06, halo: 0.1, pulseHz: 0.5, markerOpacity: 0},
    1: {emissive: 0.16, halo: 0.2, pulseHz: 0.8, markerOpacity: 0},
    2: {emissive: 0.34, halo: 0.38, pulseHz: 1.3, markerOpacity: 0},
    3: {emissive: 0.62, halo: 0.6, pulseHz: 2.1, markerOpacity: 0.85},
    4: {emissive: 0.9, halo: 0.8, pulseHz: 2.8, markerOpacity: 1},
  }

  return {
    anchor,
    markers,

    setSignal(level: SignalLevel): void {
      signal = level
      const tuning = SIGNAL_TUNING[level]
      for (const [i, mat] of markerMats.entries()) {
        const stagger = Math.min(1, Math.max(0, (tuning.markerOpacity - i * 0.06)))
        mat.opacity = stagger
        mat.emissiveIntensity = stagger * 0.8
        markers.children[i]!.visible = stagger > 0.02
      }
    },

    tick(nowMs: number, cameraPos: THREE.Vector3): void {
      if (!spawned) placeAround(cameraPos)
      const tuning = SIGNAL_TUNING[signal]

      // Reel: slow cinematic rotation + gentle bob.
      reel.rotation.z = nowMs * 0.00035 * (0.6 + tuning.pulseHz * 0.25)
      reel.rotation.y = Math.sin(nowMs * 0.0004) * 0.18
      anchor.position.y = -0.25 + Math.sin(nowMs * 0.0011) * 0.02

      // Heat-reactive glow: heartbeat pulse scales with signal level.
      const beat = (Math.sin(nowMs * 0.001 * Math.PI * 2 * tuning.pulseHz) + 1) / 2
      metal.emissiveIntensity = tuning.emissive * (0.7 + 0.5 * beat)
      ;(halo.material as THREE.MeshBasicMaterial).opacity = tuning.halo * (0.6 + 0.4 * beat)
      halo.rotation.z = nowMs * 0.0002

      // Markers slowly orbit + spin once materialised.
      if (tuning.markerOpacity > 0) {
        markers.rotation.y = nowMs * 0.00012
        for (const marker of markers.children) marker.rotation.y = nowMs * 0.001
      }
    },

    recenter(cameraPos: THREE.Vector3): void {
      spawned = false
      placeAround(cameraPos)
    },

    reset(): void {
      signal = 0
      spawned = false
      anchor.position.set(0, -0.25, -1.2)
      markers.position.set(0, 0, 0)
    },

    dispose(): void {
      scene.remove(group)
      group.traverse((obj) => {
        if (obj instanceof THREE.Mesh) {
          obj.geometry.dispose()
          const material = obj.material
          if (Array.isArray(material)) material.forEach((m) => m.dispose())
          else material.dispose()
        }
      })
    },
  }
}
