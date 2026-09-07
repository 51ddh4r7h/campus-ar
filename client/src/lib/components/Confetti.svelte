<script lang="ts">
  /**
   * The wrap party.
   *
   * Two cannons from the bottom corners for the bang, then a slow fall from
   * above so the screen is still alive while the player reads their splits.
   * The physics lives in `../confetti` and is tested there; this file only
   * draws it and owns the frame loop.
   *
   * Canvas rather than DOM nodes: a hundred and forty animated elements is a
   * hundred and forty style recalculations a frame, and this runs on whatever
   * phone a first-year owns while a video texture is already on screen. One
   * canvas, one context, no layout.
   */
  import {alphaOf, burst, rain, step, type Piece} from '../confetti'

  interface Props {
    /** Pieces in the opening burst. The fall adds a few more over time. */
    count?: number
    /** How long new pieces keep arriving, ms. Stragglers finish their fall. */
    durationMs?: number
  }

  const {count = 140, durationMs = 2600}: Props = $props()

  /** Honour the setting. A full-screen particle storm is exactly what it means. */
  const still = window.matchMedia('(prefers-reduced-motion: reduce)').matches

  function draw(ctx: CanvasRenderingContext2D, pieces: readonly Piece[]): void {
    for (const p of pieces) {
      ctx.save()
      ctx.globalAlpha = alphaOf(p)
      ctx.translate(p.x, p.y)
      ctx.rotate(p.rot)
      ctx.fillStyle = p.colour
      // Scaling the height by the spin fakes a flat strip turning edge-on.
      ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h * Math.abs(Math.cos(p.rot)))
      ctx.restore()
    }
  }

  function run(canvas: HTMLCanvasElement) {
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    // Capped: a 3x buffer on a large phone is three times the fill for pixels
    // nobody can resolve, and this is the one screen where the GPU is busy.
    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    let w = canvas.clientWidth
    let h = canvas.clientHeight
    const size = () => {
      w = canvas.clientWidth
      h = canvas.clientHeight
      canvas.width = Math.floor(w * dpr)
      canvas.height = Math.floor(h * dpr)
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    }
    size()

    let pieces = burst(w, h, count)
    let raf = 0
    let last = performance.now()
    let elapsed = 0
    let sinceDrop = 0

    const frame = (now: number) => {
      // Clamped: a backgrounded tab returns with a huge delta, and without this
      // every piece teleports off screen in a single step.
      const dt = Math.min(now - last, 34)
      last = now
      elapsed += dt

      sinceDrop += dt
      if (elapsed < durationMs && sinceDrop > 60) {
        sinceDrop = 0
        pieces = [...pieces, ...rain(w, 3)]
      }

      pieces = step(pieces, dt, h)
      ctx.clearRect(0, 0, w, h)
      draw(ctx, pieces)

      if (pieces.length > 0) raf = requestAnimationFrame(frame)
    }
    raf = requestAnimationFrame(frame)

    window.addEventListener('resize', size)
    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('resize', size)
    }
  }
</script>

{#if !still}
  <canvas {@attach run} aria-hidden="true"></canvas>
{/if}

<style>
  canvas {
    position: fixed;
    inset: 0;
    width: 100%;
    height: 100%;
    z-index: 60;
    pointer-events: none;
  }
</style>
