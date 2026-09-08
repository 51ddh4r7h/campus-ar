<script lang="ts">
  /**
   * A companion that reacts to how close you are.
   *
   * Five drawn animations from the heat band, not one loop played at five
   * speeds: the cat is asleep when there is nothing near, stirs, sits up and
   * watches, gets to its feet, and dances when you are on top of a scene.
   *
   * Pixel art on purpose. At 32px over a live camera feed it reads as a HUD
   * overlay rather than something pretending to be in the scene, which is what
   * keeps it from fighting the photographic illusion the rest of the app is
   * built on.
   *
   * Adding or reordering states is a change to `STATES` and `BY_BAND` and
   * nothing else — the drawing below does not know what any of them mean.
   */
  import {BAND_WORDS, type HeatBand} from '@cmh/shared'
  import sleepSheet from '../../assets/sprites/cat-sleep.png'
  import sleepySheet from '../../assets/sprites/cat-sleepy.png'
  import idleSheet from '../../assets/sprites/cat-idle.png'
  import excitedSheet from '../../assets/sprites/cat-excited.png'
  import danceSheet from '../../assets/sprites/cat-dance.png'

  interface Props {
    band: HeatBand
    /**
     * Walk every band on a timer instead of following the real one.
     *
     * For looking at the thing on `?demo`: a real hunt only ever shows the
     * band you happen to be standing in, and the interesting states are the
     * ones you have to walk a hundred metres to reach. The caption is not
     * decoration — while this is on, the cat and the heat meter beside it are
     * deliberately disagreeing, and something has to say which one is
     * pretending.
     */
    preview?: boolean
  }
  const {band, preview = false}: Props = $props()

  /** Cell size on screen. The sheets are 32px cells, so this is a 3x zoom. */
  const CELL = 96

  interface CatState {
    src: string
    /** Cells across the sheet. They differ per animation. */
    frames: number
    /** One full pass, seconds. */
    loop: number
    dim: number
    glow: number
  }

  const STATES = {
    sleep: {src: sleepSheet, frames: 4, loop: 2.8, dim: 0.55, glow: 0},
    sleepy: {src: sleepySheet, frames: 8, loop: 2.4, dim: 0.72, glow: 0},
    idle: {src: idleSheet, frames: 10, loop: 1.6, dim: 0.9, glow: 0},
    excited: {src: excitedSheet, frames: 12, loop: 0.95, dim: 1, glow: 0.4},
    dance: {src: danceSheet, frames: 4, loop: 0.55, dim: 1, glow: 0.85},
  } as const satisfies Record<string, CatState>

  /** Cold, Chilly, Warm, Hot, You're close. */
  const BY_BAND = ['sleep', 'sleepy', 'idle', 'excited', 'dance'] as const

  /** Long enough to watch the slowest loop come round twice. */
  const HOLD_MS = 4500

  let previewBand = $state<HeatBand>(0)

  $effect(() => {
    if (!preview) return
    const id = setInterval(() => {
      // SAFETY: `% 5` lands in 0-4, which is exactly HeatBand's domain.
      previewBand = ((previewBand + 1) % 5) as HeatBand
    }, HOLD_MS)
    return () => clearInterval(id)
  })

  const shown = $derived(preview ? previewBand : band)
  const cat = $derived(STATES[BY_BAND[shown] ?? 'sleep'])
</script>

<!-- The sheets are a couple of kilobytes each and Vite inlines them, so every
     state is already in the document when the band changes. Without that a
     first crossing would show a blank square while the browser fetched. -->
<div class="preload" aria-hidden="true">
  {#each Object.values(STATES) as s (s.src)}
    <img src={s.src} alt="" />
  {/each}
</div>

<div
  class="cat"
  style="
    --cell: {CELL}px;
    --sheet: {CELL * cat.frames}px;
    --frames: {cat.frames};
    --loop: {cat.loop}s;
    --dim: {cat.dim};
    --glow: {cat.glow};
    background-image: url('{cat.src}');
    animation-timing-function: steps({cat.frames});
  "
  aria-hidden="true"
></div>

{#if preview}
  <p class="preview-label">Cat preview · {BAND_WORDS[shown]}</p>
{/if}

<style>
  .preload {
    position: absolute;
    width: 0;
    height: 0;
    overflow: hidden;
  }
  .cat {
    position: fixed;
    left: var(--edge);
    /* Clear of the action bar, which owns the bottom of this screen. */
    bottom: calc(var(--safe-bottom) + 92px);
    z-index: 14;
    width: var(--cell);
    height: var(--cell);
    background-repeat: no-repeat;
    background-size: var(--sheet) var(--cell);
    /* Keep the pixels square — a smoothed 32px sprite turns to mush. */
    image-rendering: pixelated;
    pointer-events: none;
    opacity: var(--dim);
    filter: drop-shadow(0 0 calc(var(--glow) * 10px) rgba(232, 165, 76, var(--glow)));
    transition:
      opacity var(--dur-standard) ease,
      filter var(--dur-standard) ease;
    animation: flick var(--loop) infinite;
  }

  @keyframes flick {
    to {
      background-position-x: calc(-1 * var(--sheet));
    }
  }

  .preview-label {
    position: fixed;
    left: var(--edge);
    /* Above the cat: below it, the action bar covered it completely. */
    bottom: calc(var(--safe-bottom) + 92px + 96px + 6px);
    z-index: 14;
    margin: 0;
    padding: 2px 7px;
    border-radius: 999px;
    background: var(--scrim);
    color: var(--text-dim);
    font-family: var(--font-mono);
    font-size: var(--step-13);
    pointer-events: none;
    white-space: nowrap;
  }

  /* Still, but present — the band still reads through the pose and the glow. */
  @media (prefers-reduced-motion: reduce) {
    .cat {
      animation: none;
      background-position-x: 0;
    }
  }
</style>
