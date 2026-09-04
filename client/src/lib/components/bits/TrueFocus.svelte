<!--
  Adapted from svelte-bits — https://github.com/DavidHDev/svelte-bits
  Copyright (c) 2026 David Haz. MIT + Commons Clause.

  Changes: Tailwind classes replaced with scoped CSS against tokens.css; the
  brackets are amber rather than green; the hover-to-focus mode is dropped
  because nothing here is pointed at with a mouse; and the words inherit the
  surrounding type instead of forcing a 3rem weight-900 face.

  It is kept close to the original otherwise, because the original is already
  exactly right for this app: text that racks in and out of focus behind a set
  of corner brackets is an autofocus reticle, and this is a game about film.
-->
<script lang="ts">
  import {animate} from 'motion'

  interface FocusRect {
    x: number
    y: number
    width: number
    height: number
  }

  interface Props {
    sentence?: string
    separator?: string
    blurAmount?: number
    borderColor?: string
    glowColor?: string
    animationDuration?: number
    pauseBetweenAnimations?: number
  }

  const {
    sentence = 'True Focus',
    separator = ' ',
    blurAmount = 5,
    borderColor = 'var(--amber)',
    glowColor = 'rgba(232, 165, 76, 0.55)',
    animationDuration = 0.6,
    pauseBetweenAnimations = 1.1,
  }: Props = $props()

  const words = $derived(sentence.split(separator))

  let currentIndex = $state(0)
  let containerEl = $state<HTMLDivElement | undefined>()
  let wordEls = $state<(HTMLSpanElement | undefined)[]>([])
  let overlayEl = $state<HTMLDivElement | undefined>()
  let focusRect = $state<FocusRect>({x: 0, y: 0, width: 0, height: 0})

  /** Honour the setting: a pulsing blur is exactly what it asks us not to do. */
  const still =
    typeof window !== 'undefined' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches

  $effect(() => {
    if (still || words.length < 2) return
    const id = setInterval(
      () => (currentIndex = (currentIndex + 1) % words.length),
      (animationDuration + pauseBetweenAnimations) * 1000,
    )
    return () => clearInterval(id)
  })

  $effect(() => {
    const el = wordEls[currentIndex]
    if (!el || !containerEl) return
    const parent = containerEl.getBoundingClientRect()
    const word = el.getBoundingClientRect()
    focusRect = {
      x: word.left - parent.left,
      y: word.top - parent.top,
      width: word.width,
      height: word.height,
    }
  })

  $effect(() => {
    if (!overlayEl || still) return
    void animate(
      overlayEl,
      {x: focusRect.x, y: focusRect.y, width: focusRect.width, height: focusRect.height, opacity: 1},
      {duration: animationDuration},
    )
  })
</script>

<div class="focus" bind:this={containerEl}>
  {#each words as word, i (i)}
    <span
      bind:this={wordEls[i]}
      class="word"
      style="filter: blur({still || i === currentIndex ? 0 : blurAmount}px); transition: filter {animationDuration}s ease"
    >
      {word}
    </span>
  {/each}

  {#if !still}
    <div
      class="reticle"
      bind:this={overlayEl}
      style="--edge: {borderColor}; --glow: {glowColor}"
      aria-hidden="true"
    >
      <span class="c tl"></span><span class="c tr"></span>
      <span class="c bl"></span><span class="c br"></span>
    </div>
  {/if}
</div>

<style>
  .focus {
    position: relative;
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0 0.32em;
    user-select: none;
  }
  .word {
    position: relative;
    /* Inherits the heading it sits in — this is a lens effect, not a typeface. */
    display: inline-block;
  }
  .reticle {
    position: absolute;
    top: 0;
    left: 0;
    box-sizing: border-box;
    opacity: 0;
    pointer-events: none;
  }
  .c {
    position: absolute;
    width: 0.5rem;
    height: 0.5rem;
    border: 2px solid var(--edge);
    border-radius: 2px;
    filter: drop-shadow(0 0 4px var(--glow));
  }
  .tl {
    top: -0.5rem;
    left: -0.5rem;
    border-right: 0;
    border-bottom: 0;
  }
  .tr {
    top: -0.5rem;
    right: -0.5rem;
    border-bottom: 0;
    border-left: 0;
  }
  .bl {
    bottom: -0.5rem;
    left: -0.5rem;
    border-top: 0;
    border-right: 0;
  }
  .br {
    right: -0.5rem;
    bottom: -0.5rem;
    border-top: 0;
    border-left: 0;
  }
</style>
