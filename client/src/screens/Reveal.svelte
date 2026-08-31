<script lang="ts">
  import {onMount} from 'svelte'
  import {formatMarquee} from '@cmh/shared'
  import {nav} from '../lib/stores/nav.svelte'
  import {game} from '../lib/stores/game.svelte'
  import {ar} from '../lib/stores/ar.svelte'
  import {probe} from '../lib/stores/probe.svelte'
  import {toasts} from '../lib/stores/toast.svelte'
  import {haptics} from '../lib/haptics'
  import type {ArStage} from '../lib/ar/stage'
  import CameraFeed from '../lib/components/CameraFeed.svelte'
  import Button from '../lib/components/Button.svelte'
  import Icon from '../lib/components/Icon.svelte'

  const r = $derived(game.lastReveal)

  let useAr = $state(false)
  let video = $state<HTMLVideoElement | null>(null)
  let canvas = $state<HTMLCanvasElement | null>(null)
  let stage: ArStage | null = null
  let videoBroken = $state(false)
  let posterBroken = $state(false)

  onMount(() => {
    let disposed = false

    // Decide once: AR needs a live motion sensor. Give it a brief grace, then
    // commit — otherwise the flat letterbox panel (the guaranteed path).
    const decide = async () => {
      if (ar.supported && ar.permission === 'granted') {
        for (let i = 0; i < 15 && !ar.hasReading && !disposed; i++) {
          await new Promise((res) => setTimeout(res, 100))
        }
      }
      if (disposed) return
      useAr = ar.ready
      await Promise.resolve() // let the canvas/video render

      if (useAr && canvas && video) {
        const {createArStage} = await import('../lib/ar/stage')
        if (disposed || !canvas || !video) return
        stage = await createArStage(canvas, video)
        stage.showScreen()
        setTimeout(() => haptics.revealLock(), 720)
      } else {
        haptics.revealLock()
      }
    }
    void decide()

    return () => {
      disposed = true
      stage?.dispose()
      stage = null
    }
  })

  $effect(() => {
    stage?.setHeat(probe.last?.heat ?? 100)
  })

  function next() {
    haptics.levelDone()
    nav.go(r?.huntComplete ? 'finish' : 'clue')
  }
</script>

<CameraFeed />

<canvas bind:this={canvas} class="ar-canvas" class:hidden={!useAr}></canvas>

<div class="reveal" class:ar={useAr}>
  <div class="screen" class:offscreen={useAr}>
    {#if r && !videoBroken}
      <video
        bind:this={video}
        src={r.clipUrl}
        poster={r.posterUrl}
        autoplay
        loop
        muted={useAr}
        playsinline
        preload="auto"
        onerror={() => (videoBroken = true)}
      >
        <track kind="captions" />
      </video>
    {:else if r && !posterBroken}
      <img src={r.posterUrl} alt="" onerror={() => (posterBroken = true)} />
    {:else}
      <div class="ph"></div>
    {/if}
  </div>

  <div class="info">
    <p class="mono">
      Level {r?.level} · split {formatMarquee(r?.splitMs ?? 0)}{r?.penaltyMs
        ? ` · +${formatMarquee(r.penaltyMs)}`
        : ''}
    </p>
    <h1>{r?.locationName}</h1>
    <p class="film"><b>{r?.movie.title}</b> · filmed here</p>
    <div class="fact">{r?.campusFact}</div>
    <div class="actions">
      {#if useAr}
        <Button variant="secondary" onclick={() => stage?.recenter()}>
          <Icon name="crosshair" size={18} /> Recentre
        </Button>
      {:else}
        <Button variant="secondary" onclick={() => toasts.show('Photo mode arrives soon')}>
          <Icon name="camera" size={18} /> Take a photo
        </Button>
      {/if}
      <Button onclick={next}>{r?.huntComplete ? 'See your result' : 'Next scene'}</Button>
    </div>
  </div>
</div>

<style>
  .ar-canvas {
    position: fixed;
    inset: 0;
    z-index: 5;
    pointer-events: none;
  }
  .hidden {
    display: none;
  }
  .reveal {
    position: fixed;
    inset: 0;
    z-index: 10;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: var(--sp-4);
    padding: calc(var(--safe-top) + var(--sp-6)) var(--edge) calc(var(--safe-bottom) + var(--sp-4));
    pointer-events: none;
  }
  .reveal.ar {
    justify-content: flex-end;
  }
  .reveal :global(button) {
    pointer-events: auto;
  }
  .reveal::before,
  .reveal::after {
    content: '';
    position: fixed;
    left: 0;
    right: 0;
    height: 8vh;
    background: #000;
    animation: bar 0.6s var(--ease-spring);
    z-index: 11;
  }
  .reveal::before {
    top: 0;
  }
  .reveal::after {
    bottom: 0;
  }
  .reveal.ar::after {
    display: none;
  }
  .screen {
    width: 100%;
    max-width: 520px;
    aspect-ratio: 2.39 / 1;
    border-radius: 12px;
    overflow: hidden;
    background: #05060a;
    box-shadow:
      0 0 0 1px rgba(255, 255, 255, 0.12),
      0 24px 80px rgba(232, 165, 76, 0.28),
      0 0 120px 20px rgba(232, 165, 76, 0.12);
    animation: rise 0.9s var(--ease-spring);
  }
  .screen.offscreen {
    position: fixed;
    right: 0;
    bottom: 0;
    width: 64px;
    height: 36px;
    max-width: none;
    opacity: 0;
    box-shadow: none;
    z-index: -1;
    animation: none;
  }
  .screen video,
  .screen img,
  .screen .ph {
    width: 100%;
    height: 100%;
    object-fit: cover;
    display: block;
  }
  .ph {
    background: linear-gradient(160deg, #1a2230, #0a0d12);
  }
  .info {
    width: 100%;
    max-width: 520px;
    padding: var(--sp-4);
    border-radius: var(--radius-card);
    background: var(--surface-raised);
    backdrop-filter: blur(var(--blur));
    border: var(--glass-border);
    border-top-color: var(--hairline-bright);
    animation: rise 0.9s var(--ease-spring) 0.15s both;
  }
  .mono {
    font-family: var(--font-mono);
    font-size: var(--step-13);
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: var(--text-dim);
    margin: 0;
  }
  h1 {
    font-family: var(--font-display);
    font-weight: 400;
    font-size: var(--step-28);
    margin: var(--sp-2) 0 var(--sp-1);
  }
  .film {
    color: var(--text-dim);
    margin: 0 0 var(--sp-3);
  }
  .film b {
    color: var(--text);
  }
  .fact {
    padding: var(--sp-3);
    border-radius: 12px;
    background: rgba(0, 0, 0, 0.28);
    font-size: var(--step-15);
    margin-bottom: var(--sp-4);
  }
  .actions {
    display: flex;
    gap: var(--sp-3);
  }
  .actions :global(.primary) {
    flex: 1;
  }
  @keyframes rise {
    from {
      transform: scale(0.92);
      opacity: 0;
    }
  }
  @keyframes bar {
    from {
      transform: scaleY(0);
    }
  }
</style>
