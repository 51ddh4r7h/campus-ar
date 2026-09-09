<script lang="ts" module>
  /** Every pose the mascot can strike. Add a sheet, add a line here, done. */
  export type CatPose =
    | 'sleep'
    | 'sleepy'
    | 'idle'
    | 'excited'
    | 'dance'
    | 'surprised'
    | 'waiting'
    | 'sad'
</script>

<script lang="ts">
  /**
   * The mascot. One pixel cat that hangs around the corner of every screen and
   * reacts to where you are in the game — asleep on the landing page, sitting up
   * on the start line, dancing when you finish, sulking when the clock beats you.
   *
   * Pixel art on purpose. At this size over a live camera it reads as a HUD
   * sticker rather than something pretending to be in the shot, which is what
   * keeps it from fighting the photographic illusion the rest of the app leans
   * on. `aria-hidden` and `pointer-events: none` throughout — it is decoration,
   * it never sits between the player and a control.
   *
   * The drawing below does not know what any pose means. Reordering or adding
   * one is a change to `POSES` and nothing else.
   */
  import sleepSheet from '../../assets/sprites/cat-sleep.png'
  import sleepySheet from '../../assets/sprites/cat-sleepy.png'
  import idleSheet from '../../assets/sprites/cat-idle.png'
  import excitedSheet from '../../assets/sprites/cat-excited.png'
  import danceSheet from '../../assets/sprites/cat-dance.png'
  import surprisedSheet from '../../assets/sprites/cat-surprised.png'
  import waitingSheet from '../../assets/sprites/cat-waiting.png'
  import sadSheet from '../../assets/sprites/cat-sad.png'

  interface Props {
    pose: CatPose
    /**
     * Which bottom corner to hang from. Pick per screen by where the content
     * isn't: 'bl' against a left-aligned layout, 'br' where the right side is
     * the emptier one. The cat only ever lives in a corner — that is what keeps
     * it out of the way whatever the screen is doing.
     */
    anchor?: 'bl' | 'br'
    /**
     * Lift the cat clear of a bottom control bar. The camera screens float one
     * there; the entry screens do not, so their cat sits right in the corner.
     */
    raised?: boolean
  }
  const {pose, anchor = 'bl', raised = false}: Props = $props()

  /** Cell size on screen. The sheets are 32px cells, so this is 2x zoom. */
  const CELL = 64

  interface PoseSpec {
    src: string
    /** Cells across the sheet — differs per animation. */
    frames: number
    /** One full pass, seconds. */
    loop: number
    /** Resting opacity: a sleeping cat sits back, an excited one is full strength. */
    dim: number
    /** Warm halo, 0–1. */
    glow: number
  }

  const POSES = {
    sleep: {src: sleepSheet, frames: 4, loop: 2.8, dim: 0.5, glow: 0},
    sleepy: {src: sleepySheet, frames: 8, loop: 2.4, dim: 0.72, glow: 0},
    idle: {src: idleSheet, frames: 10, loop: 1.6, dim: 0.9, glow: 0},
    excited: {src: excitedSheet, frames: 12, loop: 0.95, dim: 1, glow: 0.4},
    dance: {src: danceSheet, frames: 4, loop: 0.55, dim: 1, glow: 0.85},
    surprised: {src: surprisedSheet, frames: 12, loop: 0.8, dim: 1, glow: 0.5},
    waiting: {src: waitingSheet, frames: 6, loop: 2.0, dim: 0.85, glow: 0},
    sad: {src: sadSheet, frames: 9, loop: 2.2, dim: 0.66, glow: 0},
  } as const satisfies Record<CatPose, PoseSpec>

  const cat = $derived(POSES[pose] ?? POSES.idle)
</script>

<!-- The sheets are a couple of kilobytes each and Vite inlines them, so every
     pose is already in the document. Without this a pose change would flash a
     blank square while the browser fetched. -->
<div class="preload" aria-hidden="true">
  {#each Object.values(POSES) as p (p.src)}
    <img src={p.src} alt="" />
  {/each}
</div>

<div
  class="cat"
  class:raised
  class:right={anchor === 'br'}
  style="
    --cell: {CELL}px;
    --sheet: {CELL * cat.frames}px;
    --dim: {cat.dim};
    --glow: {cat.glow};
    background-image: url('{cat.src}');
    animation-timing-function: steps({cat.frames});
    animation-duration: {cat.loop}s;
  "
  aria-hidden="true"
></div>

<style>
  .preload {
    position: absolute;
    width: 0;
    height: 0;
    overflow: hidden;
  }
  .cat {
    position: fixed;
    /* Tucked past the edge so only the front of the cat shows — it reads as
       peeking in, and its footprint over any corner text is small. */
    left: calc(max(var(--safe-left), 0px) - 14px);
    /* Entry screens: down in the corner by the primary button, whose label is
       centred so nothing readable is covered. */
    bottom: calc(var(--safe-bottom) + 4px);
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
      filter var(--dur-standard) ease,
      bottom var(--dur-standard) ease;
    animation-name: flick;
    animation-iteration-count: infinite;
  }
  .cat.right {
    left: auto;
    right: calc(max(var(--safe-right), 0px) - 14px);
    /* Face back into the screen. */
    transform: scaleX(-1);
  }

  /* Camera screens: clear of the floating control bar at the bottom. */
  .cat.raised {
    bottom: calc(var(--safe-bottom) + 98px);
  }

  @keyframes flick {
    to {
      background-position-x: calc(-1 * var(--sheet));
    }
  }

  /* Still, but present — the pose still reads, and so does the glow. */
  @media (prefers-reduced-motion: reduce) {
    .cat {
      animation: none;
      background-position-x: 0;
    }
  }
</style>
