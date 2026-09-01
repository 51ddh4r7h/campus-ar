/**
 * Lighting for the one lit object in the scene.
 *
 * Almost everything here is unlit — flat colour composited over the camera
 * feed. The downloaded projector is the exception: it is PBR, and it is the
 * thing a player looks at, so it has to look like it belongs in front of them
 * rather than pasted on.
 *
 * The key light is the screen. Not a lamp placed beside the screen — a
 * RectAreaLight the same size and in the same place as the picture, so the
 * projector is genuinely lit by the film it is showing. Its intensity follows
 * the entry animation, which means the machine comes out of the dark as the
 * picture fades up, exactly as it would if the light were real. That is the
 * whole trick, and it is why the key is worth the extra shader cost.
 *
 * Around it: a cool hemisphere fill so the unlit side does not go black, and a
 * dim rim from behind to lift the silhouette off a dark campus at night. Three
 * lights, no shadow maps — shadows are the expensive part on a phone, and with
 * nothing to receive them there is nothing to gain.
 */

import type * as THREE_NS from 'three'

export interface Lighting {
  group: THREE_NS.Group
  /** `p` is entry progress 0-1: the screen brightens, so its light does too. */
  setLevel(p: number): void
  dispose(): void
}

const SCREEN_LIGHT = 0xffd9a8
const SKY = 0xa8c4ff
const GROUND = 0x2b2118
const RIM = 0xbcd0ff

export async function createLighting(
  THREE: typeof THREE_NS,
  screen: {width: number; height: number; y: number; distance: number},
): Promise<Lighting> {
  const group = new THREE.Group()

  // RectAreaLight needs its lookup textures built before first use, and only
  // affects standard/physical materials — both true of the loaded model.
  try {
    const {RectAreaLightUniformsLib} = await import(
      'three/examples/jsm/lights/RectAreaLightUniformsLib.js'
    )
    RectAreaLightUniformsLib.init()
  } catch {
    // Without the uniforms the area light renders black; the fill still works.
  }

  const key = new THREE.RectAreaLight(SCREEN_LIGHT, 0, screen.width, screen.height)
  key.position.set(0, screen.y, -screen.distance)
  // Facing the viewer, the same way the picture does.
  key.lookAt(0, screen.y, 0)
  group.add(key)

  const fill = new THREE.HemisphereLight(SKY, GROUND, 0)
  group.add(fill)

  const rim = new THREE.DirectionalLight(RIM, 0)
  rim.position.set(-1.4, 1.1, 0.8)
  group.add(rim)

  return {
    group,

    setLevel(p) {
      const k = Math.max(0, Math.min(1, p))
      // The screen is by far the brightest thing here, so it carries the look;
      // the other two only keep the dark side from going flat black.
      key.intensity = k * 7
      fill.intensity = k * 0.55
      rim.intensity = k * 0.7
    },

    dispose() {
      key.dispose()
      fill.dispose()
      rim.dispose()
    },
  }
}
