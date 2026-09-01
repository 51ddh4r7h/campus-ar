/**
 * Loading the set dressing.
 *
 * The props are Draco-compressed GLBs served from our own origin, decoded by a
 * worker whose wasm also lives here — nothing is fetched from a CDN, so there
 * is no third party between a player and their scene.
 *
 * Two rules run through all of this. A model never blocks the reveal: every
 * load is allowed to fail and the caller falls back to geometry it built
 * itself. And every model arrives in someone else's units, facing some other
 * direction, with its origin wherever the artist left it — so nothing is
 * placed until it has been measured and normalised into ours.
 */

import type * as THREE_NS from 'three'

/** Where the compressed decoder lives, relative to the site root. */
const DRACO_PATH = '/draco/'

export type PropName = 'film_projector' | 'clapperboard' | 'stage_light' | 'film_reel'

let loaderPromise: Promise<{
  load(url: string): Promise<THREE_NS.Group>
  dispose(): void
} | null> | null = null

/**
 * One loader for the document. Building a DRACOLoader spins up worker threads,
 * so it is worth doing once and never per prop.
 */
async function loader() {
  if (!loaderPromise) {
    loaderPromise = (async () => {
      try {
        const [{GLTFLoader}, {DRACOLoader}] = await Promise.all([
          import('three/examples/jsm/loaders/GLTFLoader.js'),
          import('three/examples/jsm/loaders/DRACOLoader.js'),
        ])
        const draco = new DRACOLoader().setDecoderPath(DRACO_PATH)
        const gltf = new GLTFLoader().setDRACOLoader(draco)
        return {
          load: (url: string) =>
            new Promise<THREE_NS.Group>((resolve, reject) => {
              gltf.load(url, (g) => resolve(g.scene), undefined, reject)
            }),
          dispose: () => draco.dispose(),
        }
      } catch {
        return null
      }
    })()
  }
  return loaderPromise
}

/**
 * Scale and centre a loaded model so its longest side is `sizeM` metres and its
 * base sits on y=0, facing -Z. Artists model at wildly different scales — a
 * prop can arrive a hundred times too big — so this is what makes a downloaded
 * asset safe to place next to hand-built geometry.
 */
export function normalise(
  THREE: typeof THREE_NS,
  model: THREE_NS.Object3D,
  sizeM: number,
): THREE_NS.Group {
  const box = new THREE.Box3().setFromObject(model)
  const span = box.getSize(new THREE.Vector3())
  const longest = Math.max(span.x, span.y, span.z) || 1
  const k = sizeM / longest

  model.scale.setScalar(k)
  // Re-measure after scaling; the box does not scale with the object.
  const scaled = new THREE.Box3().setFromObject(model)
  const mid = scaled.getCenter(new THREE.Vector3())
  model.position.sub(new THREE.Vector3(mid.x, scaled.min.y, mid.z))

  const holder = new THREE.Group()
  holder.add(model)
  return holder
}

/**
 * Load a prop, normalised and ready to place. Resolves null when anything at
 * all goes wrong — a 404, a decoder that will not start, a corrupt file — so
 * callers can fall back rather than handle errors.
 */
export async function loadProp(
  THREE: typeof THREE_NS,
  name: PropName,
  sizeM: number,
): Promise<THREE_NS.Group | null> {
  const l = await loader()
  if (!l) return null
  try {
    const scene = await l.load(`/models/${name}.glb`)
    return normalise(THREE, scene, sizeM)
  } catch {
    return null
  }
}

/** Free every geometry, material and texture a loaded prop owns. */
export function disposeProp(root: THREE_NS.Object3D): void {
  root.traverse((o) => {
    const mesh = o as THREE_NS.Mesh
    if (!mesh.isMesh) return
    mesh.geometry.dispose()
    const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material]
    for (const m of mats) {
      for (const key of Object.keys(m) as Array<keyof typeof m>) {
        const val = m[key]
        if (val && typeof val === 'object' && 'isTexture' in val) {
          ;(val as THREE_NS.Texture).dispose()
        }
      }
      m.dispose()
    }
  })
}
