/**
 * Zero-dependency confetti burst for the summary screen.
 *
 * Gold/ember/chalk "marquee sparks" on a fixed canvas. Honors
 * prefers-reduced-motion by not firing at all.
 */

const COLORS = ['#F3B93F', '#FFE9AE', '#D94838', '#EAE4D5', '#B97E1E']

interface Particle {
  x: number
  y: number
  vx: number
  vy: number
  size: number
  color: string
  rotation: number
  vr: number
}

export function fireConfetti(durationMs = 2600): void {
  if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return

  const canvas = document.getElementById('confetti-canvas') as HTMLCanvasElement | null
  if (!canvas) return
  const ctx = canvas.getContext('2d')
  if (!ctx) return
  canvas.classList.remove('hidden')

  const dpr = window.devicePixelRatio || 1
  canvas.width = window.innerWidth * dpr
  canvas.height = window.innerHeight * dpr
  ctx.scale(dpr, dpr)

  const W = window.innerWidth
  const H = window.innerHeight
  const burst = (originX: number, count: number): Particle[] =>
    Array.from({length: count}, () => {
      const angle = Math.random() * Math.PI * 2
      const speed = 4 + Math.random() * 7
      return {
        x: originX,
        y: H * 0.28,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - 5,
        size: 3 + Math.random() * 5,
        color: COLORS[Math.floor(Math.random() * COLORS.length)] ?? '#F3B93F',
        rotation: Math.random() * Math.PI,
        vr: (Math.random() - 0.5) * 0.3,
      }
    })

  const particles: Particle[] = [...burst(W * 0.25, 70), ...burst(W * 0.75, 70)]
  const startedAt = performance.now()

  const frame = (now: number): void => {
    const elapsed = now - startedAt
    ctx.clearRect(0, 0, W, H)
    const fade = Math.max(0, 1 - elapsed / durationMs)
    for (const p of particles) {
      p.vy += 0.18 // gravity
      p.vx *= 0.99
      p.x += p.vx
      p.y += p.vy
      p.rotation += p.vr
      ctx.save()
      ctx.globalAlpha = fade
      ctx.translate(p.x, p.y)
      ctx.rotate(p.rotation)
      ctx.fillStyle = p.color
      ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size * 0.6)
      ctx.restore()
    }
    if (elapsed < durationMs) window.requestAnimationFrame(frame)
    else {
      ctx.clearRect(0, 0, W, H)
      canvas.classList.add('hidden')
    }
  }
  window.requestAnimationFrame(frame)
}
