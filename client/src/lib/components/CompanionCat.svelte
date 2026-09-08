<script lang="ts">
  /**
   * A companion that reacts to how close you are.
   *
   * One 320x32 sheet — ten frames of a cat sitting, tail going — driven from
   * the heat band. There is only the one animation in the free pack, so the
   * emotion is carried by how it is played rather than by different drawings:
   * the flick slows to almost nothing when you are cold, quickens as you warm,
   * and breaks into a bounce with an amber glow on the last band. Swapping in
   * real sleepy/dancing sheets later is a change to `BANDS` and two files.
   *
   * Pixel art on purpose. At 32px over a live camera feed it reads as a HUD
   * overlay rather than something pretending to be in the scene, which is what
   * keeps it from fighting the photographic illusion the rest of the app is
   * built on.
   */
  import {BAND_WORDS, type HeatBand} from '@cmh/shared'

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

  /** Long enough to watch the slowest loop (2.6s) come round twice. */
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

  /** Cell size on screen. The sheet is 32px cells, so this is a 3x zoom. */
  const CELL = 96
  const FRAMES = 10

  /** How the one idle loop is played at each band. */
  const BANDS = [
    {loop: 2.6, opacity: 0.5, grey: 0.55, bounce: 0, glow: 0},
    {loop: 1.9, opacity: 0.68, grey: 0.3, bounce: 0, glow: 0},
    {loop: 1.3, opacity: 0.85, grey: 0.1, bounce: 0, glow: 0},
    {loop: 0.85, opacity: 1, grey: 0, bounce: 0.95, glow: 0.35},
    {loop: 0.5, opacity: 1, grey: 0, bounce: 0.45, glow: 0.8},
  ] as const

  const look = $derived(BANDS[shown] ?? BANDS[0])
</script>

<div
  class="cat"
  class:bouncing={look.bounce > 0}
  style="
    --cell: {CELL}px;
    --sheet: {CELL * FRAMES}px;
    --loop: {look.loop}s;
    --bounce: {look.bounce}s;
    --opacity: {look.opacity};
    --grey: {look.grey};
    --glow: {look.glow};
  "
  aria-hidden="true"
></div>

{#if preview}
  <p class="preview-label">Cat preview · {BAND_WORDS[shown]}</p>
{/if}

<style>
  .cat {
    position: fixed;
    left: var(--edge);
    /* Clear of the action bar, which owns the bottom of this screen. */
    bottom: calc(var(--safe-bottom) + 92px);
    z-index: 14;
    width: var(--cell);
    height: var(--cell);
    background-image: url('../../assets/sprites/cat-idle.png');
    background-repeat: no-repeat;
    background-size: var(--sheet) var(--cell);
    /* Keep the pixels square — a smoothed 32px sprite turns to mush. */
    image-rendering: pixelated;
    pointer-events: none;
    opacity: var(--opacity);
    filter: grayscale(var(--grey))
      drop-shadow(0 0 calc(var(--glow) * 10px) rgba(232, 165, 76, var(--glow)));
    transition:
      opacity var(--dur-standard) ease,
      filter var(--dur-standard) ease;
    animation: flick var(--loop) steps(10) infinite;
  }
  .cat.bouncing {
    animation:
      flick var(--loop) steps(10) infinite,
      hop var(--bounce) var(--ease-spring) infinite;
  }

  @keyframes flick {
    to {
      background-position-x: calc(-1 * var(--sheet));
    }
  }
  @keyframes hop {
    0%,
    100% {
      translate: 0 0;
    }
    45% {
      translate: 0 -14%;
    }
  }

  .preview-label {
    position: fixed;
    left: var(--edge);
    /* Above the cat, not below it: the action bar owns the bottom of this
       screen and was covering the caption entirely. 92px clears the bar, 96px
       is the sprite, and the rest is a gap. */
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

  /* Still, but present — the band still reads through opacity and the glow. */
  @media (prefers-reduced-motion: reduce) {
    .cat,
    .cat.bouncing {
      animation: none;
      background-position-x: 0;
    }
  }
</style>
