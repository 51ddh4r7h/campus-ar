/**
 * Reveal device — disabled. The curved cinemascope screen IS the reveal.
 * Formerly a world-space clapperboard; removed per UX request ("get rid of the
 * clapperboard entirely"). This stub keeps the ArControl contract intact
 * without adding any meshes to the scene.
 */
import * as THREE from 'three'
import type {FilmSpot} from './data/spots'

export interface RevealDevice {
  group: THREE.Group
  onOpen: ((spot: FilmSpot) => void) | null
  show(spot: FilmSpot): void
  reset(): void
  tick(nowMs: number): void
}

export function createRevealDevice(_scene: THREE.Scene): RevealDevice {
  const group = new THREE.Group()
  group.visible = false
  return {
    group,
    onOpen: null,
    show(_spot: FilmSpot): void {
      // no slate — ar.ts triggerReveal now opens the DOM panel directly
    },
    reset(): void {},
    tick(_nowMs: number): void {},
  }
}
