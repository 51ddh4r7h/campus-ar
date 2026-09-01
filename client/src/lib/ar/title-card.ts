/**
 * The title card — a festival caption hanging in the air beside the screen.
 *
 * Drawn once into a canvas and used as a texture, so the type is real type
 * rather than extruded geometry: crisp at any distance, no font loading inside
 * the 3D scene, and it costs one quad.
 */

import type * as THREE_NS from 'three'

export interface TitleCard {
  mesh: THREE_NS.Mesh
  setOpacity(o: number): void
  dispose(): void
}

const W = 1024
const H = 256
/** Card width in metres; height follows the canvas aspect. */
const CARD_W = 1.5

export function createTitleCard(
  THREE: typeof THREE_NS,
  text: {title: string; note: string},
): TitleCard {
  const canvas = document.createElement('canvas')
  canvas.width = W
  canvas.height = H
  const g = canvas.getContext('2d')!

  g.clearRect(0, 0, W, H)

  // A hairline rule above the title, the way a festival caption is set.
  g.strokeStyle = 'rgba(232,165,76,0.85)'
  g.lineWidth = 3
  g.beginPath()
  g.moveTo(0, 26)
  g.lineTo(150, 26)
  g.stroke()

  g.fillStyle = '#f5f3ec'
  g.font = '500 76px "Instrument Serif", Georgia, serif'
  g.textBaseline = 'top'
  g.fillText(text.title, 0, 62)

  g.fillStyle = 'rgba(245,243,236,0.62)'
  g.font = '400 34px ui-monospace, "SF Mono", Menlo, monospace'
  g.fillText(text.note.toUpperCase(), 2, 168)

  const tex = new THREE.CanvasTexture(canvas)
  tex.colorSpace = THREE.SRGBColorSpace
  tex.generateMipmaps = false
  tex.minFilter = THREE.LinearFilter

  const mat = new THREE.MeshBasicMaterial({
    map: tex,
    transparent: true,
    opacity: 0,
    depthTest: false,
    depthWrite: false,
    toneMapped: false,
  })

  const geo = new THREE.PlaneGeometry(CARD_W, (CARD_W * H) / W)
  const mesh = new THREE.Mesh(geo, mat)
  mesh.renderOrder = 4

  return {
    mesh,
    setOpacity(o) {
      mat.opacity = Math.max(0, Math.min(1, o))
    },
    dispose() {
      tex.dispose()
      mat.dispose()
      geo.dispose()
    },
  }
}
