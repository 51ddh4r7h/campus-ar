<script lang="ts">
  /**
   * A light sweeping across text.
   *
   * The technique is svelte-bits' ShinyText; the implementation is not. Theirs
   * drives a requestAnimationFrame loop that writes component state on every
   * frame to move a gradient — sixty renders a second to animate a background
   * position, which CSS does on the compositor for free. On the entry screens,
   * where a mid-range phone is also cross-fading a photographic backdrop, that
   * is not a trade worth making.
   *
   * It earns its place rather than being decoration: a bar of light travelling
   * across a title is what a projector does, and this is the screen where we
   * are telling someone their campus is a film set.
   */
  interface Props {
    text: string
    /** One full cycle: the sweep plus the pause after it. */
    cycle?: number
    delay?: number
  }

  const {text, cycle = 6, delay = 0.8}: Props = $props()
</script>

<!-- The glyphs are painted twice: once normally, so the text keeps whatever
     colour it inherits, and once more by the overlay below, clipped to the same
     shapes and carrying only the highlight. Clipping a gradient built from
     `currentColor` on a single element cannot work — the clip needs
     `color: transparent`, and `currentColor` then resolves to exactly that, so
     the gradient and the text both disappear. -->
<span class="sheen" style="--cycle: {cycle}s; --delay: {delay}s" data-text={text}>{text}</span>

<style>
  .sheen {
    position: relative;
    display: inline-block;
  }
  .sheen::after {
    content: attr(data-text);
    position: absolute;
    inset: 0;
    background-image: linear-gradient(
      100deg,
      transparent 42%,
      rgba(255, 255, 255, 0.92) 50%,
      transparent 58%
    );
    background-size: 280% 100%;
    background-repeat: no-repeat;
    -webkit-background-clip: text;
    background-clip: text;
    color: transparent;
    animation: sheen var(--cycle) linear var(--delay) infinite;
    pointer-events: none;
  }

  /* The sweep occupies the first 40% of the cycle and then holds, which is what
     puts a pause between passes. A keyframe stop cannot be a custom property,
     so the split is fixed here and `cycle` sets the pace. */
  @keyframes sheen {
    0% {
      background-position: 190% 0;
    }
    40%,
    100% {
      background-position: -90% 0;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .sheen::after {
      content: none;
    }
  }
</style>
