<script lang="ts">
  /**
   * Progressive blur along the bottom edge, so copy sits on something soft
   * instead of on a visible gradient band.
   *
   * The technique is svelte-bits' GradualBlur: stack masked layers, each
   * blurring a little harder, and the eye reads the steps as a smooth ramp.
   * The cost is the catch — every `backdrop-filter` forces its own full-screen
   * render pass of everything behind it, and their presets stack five to ten of
   * them. Over a cross-fading photographic backdrop on a mid-range Android that
   * is a stutter, on the one screen that has to make a first impression.
   *
   * Three layers is where it stops being obviously stepped. Going further buys
   * very little and costs a pass each time.
   */
  interface Props {
    /** How tall the ramp is. */
    height?: string
    /** Blur of the strongest (bottom) layer, px. */
    strength?: number
  }

  const {height = '38vh', strength = 14}: Props = $props()

  // Each layer is masked to the lower part of the one before, so their blurs
  // compound towards the bottom rather than each covering the whole ramp.
  const layers = $derived([
    {blur: strength * 0.18, from: 0, to: 55},
    {blur: strength * 0.45, from: 35, to: 78},
    {blur: strength, from: 62, to: 100},
  ])
</script>

<div class="edge" style="--h: {height}" aria-hidden="true">
  {#each layers as l (l.blur)}
    <div
      style="
        backdrop-filter: blur({l.blur.toFixed(2)}px);
        -webkit-backdrop-filter: blur({l.blur.toFixed(2)}px);
        mask-image: linear-gradient(to bottom, transparent {l.from}%, #000 {l.to}%);
        -webkit-mask-image: linear-gradient(to bottom, transparent {l.from}%, #000 {l.to}%);
      "
    ></div>
  {/each}
</div>

<style>
  .edge {
    position: fixed;
    left: 0;
    right: 0;
    bottom: 0;
    height: var(--h);
    z-index: 0;
    pointer-events: none;
  }
  .edge > div {
    position: absolute;
    inset: 0;
  }
  /* backdrop-filter is the whole mechanism — with transparency reduced there is
     nothing to blur behind, and three render passes would buy nothing. */
  @media (prefers-reduced-transparency: reduce) {
    .edge {
      display: none;
    }
  }
</style>
