<script lang="ts">
  /**
   * A slow cross-fade of real frames from the scenes, behind the entry screens.
   *
   * These are the actual stills the game is built on, not stock imagery — the
   * first thing a new player sees is the campus they are about to walk, shot on
   * film. Heavily dimmed and grained so it reads as atmosphere and never fights
   * the text in front of it.
   *
   * Frames that fail to load are skipped rather than shown as gaps, so a
   * deployment missing a clip degrades to fewer images instead of black holes.
   */
  import {onMount} from 'svelte'
  import {LOCATIONS} from '@cmh/shared'

  const {intervalMs = 5200}: {intervalMs?: number} = $props()

  /** Shuffled once per mount, so two players don't see the same opening frame. */
  const posters = LOCATIONS.map((l) => l.posterUrl).sort(() => Math.random() - 0.5)

  let index = $state(0)
  let usable = $state<string[]>([])

  const drop = (src: string) => {
    usable = usable.filter((s) => s !== src)
  }

  onMount(() => {
    usable = [...posters]
    const id = setInterval(() => {
      if (usable.length > 1) index = (index + 1) % usable.length
    }, intervalMs)
    return () => clearInterval(id)
  })
</script>

<div class="backdrop" aria-hidden="true">
  {#each usable as src, i (src)}
    <img {src} alt="" class:on={i === index % Math.max(1, usable.length)} onerror={() => drop(src)} />
  {/each}
  <div class="veil"></div>
  <div class="grain"></div>
</div>

<style>
  .backdrop {
    position: fixed;
    inset: 0;
    z-index: 0;
    overflow: hidden;
    background: var(--bg);
    pointer-events: none;
  }
  img {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    object-fit: cover;
    opacity: 0;
    /* A slow drift stops a still image reading as a broken video. */
    transform: scale(1.08);
    transition:
      opacity 1.6s ease,
      transform 6s linear;
  }
  img.on {
    opacity: 0.34;
    transform: scale(1.16);
  }
  /* Bottom-weighted so the copy always sits on near-black. */
  .veil {
    position: absolute;
    inset: 0;
    background:
      linear-gradient(to bottom, rgba(10, 11, 13, 0.55) 0%, rgba(10, 11, 13, 0.82) 46%, var(--bg) 88%),
      radial-gradient(120% 70% at 50% 0%, rgba(232, 165, 76, 0.12), transparent 60%);
  }
  .grain {
    position: absolute;
    inset: 0;
    opacity: 0.2;
    mix-blend-mode: overlay;
    background: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='140' height='140'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='140' height='140' filter='url(%23n)' opacity='0.55'/%3E%3C/svg%3E");
  }
  @media (prefers-reduced-motion: reduce) {
    img {
      transition: opacity 0.4s ease;
      transform: none;
    }
    img.on {
      transform: none;
    }
  }
  @media (prefers-reduced-transparency: reduce) {
    .grain {
      display: none;
    }
  }
</style>
