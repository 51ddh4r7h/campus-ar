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
  import type {HeatBand} from '@cmh/shared'

  interface Props {
    band: HeatBand
  }
  const {band}: Props = $props()

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

  const look = $derived(BANDS[band] ?? BANDS[0])
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

  /* Still, but present — the band still reads through opacity and the glow. */
  @media (prefers-reduced-motion: reduce) {
    .cat,
    .cat.bouncing {
      animation: none;
      background-position-x: 0;
    }
  }
</style>
