<script lang="ts">
  /**
   * The proximity ring, on screen.
   *
   * Draws the ground circle from `ground-ring.ts` over the camera feed and
   * breathes it in time with how close the player is. Deliberately an SVG over
   * the feed rather than a second three.js stage: it needs pitch and roll only,
   * and two WebGL contexts on a mid-range phone is a real risk.
   *
   * It appears only in the last stretch. Before that the player is recognising
   * a place from a film clip, and anything drawn on the ground would be
   * answering a question they are supposed to answer themselves.
   */
  import {onMount} from 'svelte'
  import {GATE_HEAT, projectRing, pulseHz, radiusForHeat, ringPath} from '../ar/ground-ring'

  const {heat = 0}: {heat?: number} = $props()

  /** Matches the AR stage's assumed camera geometry. */
  const CAMERA_HFOV_DEG = 66

  let pitch = $state(0)
  let roll = $state(0)
  let live = $state(false)
  let w = $state(0)
  let h = $state(0)
  let phase = $state(0)

  const showing = $derived(heat >= GATE_HEAT && live && w > 0)

  const geometry = $derived.by(() => {
    if (!showing) return null
    // three's fov is vertical; derive it from the horizontal one the phone
    // camera actually has, exactly as the AR stage does.
    const halfH = Math.tan((CAMERA_HFOV_DEG * Math.PI) / 360)
    const fovY = 2 * Math.atan(halfH / (w / h))

    // Breathe: the ring contracts and swells, faster as the player closes in.
    const breathe = 1 + Math.sin(phase) * 0.07
    const base = radiusForHeat(heat)
    const view = {pitch, roll, fovY, width: w, height: h}

    const outer = projectRing(view, base * breathe)
    if (!outer) return null
    // A second, tighter ring reads as light pooling rather than as a wire
    // circle drawn on the floor.
    const inner = projectRing(view, base * breathe * 0.82)
    return {
      outer: ringPath(outer, outer.length === 72),
      inner: inner ? ringPath(inner, inner.length === 72) : null,
    }
  })

  /** 0 at the gate, 1 on arrival — drives brightness and pulse rate. */
  const closeness = $derived(Math.max(0, Math.min(1, (heat - GATE_HEAT) / (100 - GATE_HEAT))))

  onMount(() => {
    const measure = () => {
      w = window.innerWidth
      h = window.innerHeight
    }
    measure()
    window.addEventListener('resize', measure)

    // Lock to the first stream that reports. Listening to both
    // `deviceorientation` and `deviceorientationabsolute` mixes two different
    // reference frames, which makes the picture visibly jitter.
    let source: string | null = null
    const onOrient = (raw: Event) => {
      // SAFETY: only ever registered on `deviceorientation` and
      // `deviceorientationabsolute`, both of which dispatch this type.
      const e = raw as DeviceOrientationEvent
      if (e.beta === null && e.gamma === null) return
      source ??= raw.type
      if (raw.type !== source) return
      live = true
      // beta is 90 with the phone upright looking at the horizon, and falls
      // toward 0 as the back camera tilts down at the ground.
      const target = ((90 - (e.beta ?? 90)) * Math.PI) / 180
      // Smooth: a raw sensor value redrawn every frame shimmers.
      pitch += (target - pitch) * 0.15
      roll += ((((e.gamma ?? 0) * Math.PI) / 180) - roll) * 0.15
    }
    window.addEventListener('deviceorientation', onOrient, true)
    window.addEventListener('deviceorientationabsolute', onOrient, true)

    let raf = 0
    let last = performance.now()
    const tick = (now: number) => {
      raf = requestAnimationFrame(tick)
      const dt = Math.min(0.064, (now - last) / 1000)
      last = now
      if (heat >= GATE_HEAT) phase += dt * pulseHz(heat) * Math.PI * 2
    }
    raf = requestAnimationFrame(tick)

    return () => {
      window.removeEventListener('resize', measure)
      window.removeEventListener('deviceorientation', onOrient, true)
      window.removeEventListener('deviceorientationabsolute', onOrient, true)
      cancelAnimationFrame(raf)
    }
  })
</script>

{#if geometry}
  <svg class="ring" viewBox="0 0 {w} {h}" aria-hidden="true" style="--k: {closeness}">
    <defs>
      <filter id="ring-soft" x="-30%" y="-30%" width="160%" height="160%">
        <!-- Soft-edged on purpose. We do not know where the real ground is:
             our AR is 3DoF with no plane detection, so on a slope a crisp
             circle would visibly float. A glow is honest about its precision. -->
        <feGaussianBlur stdDeviation="9" />
      </filter>
    </defs>
    <g filter="url(#ring-soft)">
      <path class="outer" d={geometry.outer} />
      {#if geometry.inner}<path class="inner" d={geometry.inner} />{/if}
    </g>
  </svg>
{/if}

<style>
  .ring {
    position: fixed;
    inset: 0;
    width: 100%;
    height: 100%;
    z-index: 4;
    pointer-events: none;
  }
  .outer,
  .inner {
    fill: none;
    stroke: var(--amber);
    stroke-linecap: round;
  }
  .outer {
    stroke-width: calc(6px + var(--k) * 8px);
    opacity: calc(0.28 + var(--k) * 0.42);
  }
  .inner {
    stroke-width: calc(3px + var(--k) * 5px);
    opacity: calc(0.14 + var(--k) * 0.3);
  }
  @media (prefers-reduced-motion: reduce) {
    /* The contraction still carries the information; only the breathing goes. */
    .outer,
    .inner {
      opacity: calc(0.3 + var(--k) * 0.4);
    }
  }
</style>
