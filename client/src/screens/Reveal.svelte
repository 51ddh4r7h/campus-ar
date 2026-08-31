<script lang="ts">
  import {onMount} from 'svelte'
  import {formatMarquee} from '@cmh/shared'
  import {nav} from '../lib/stores/nav.svelte'
  import {game} from '../lib/stores/game.svelte'
  import {ar} from '../lib/stores/ar.svelte'
  import {probe} from '../lib/stores/probe.svelte'
  import {haptics} from '../lib/haptics'
  import {revealVideo} from '../lib/reveal-video'
  import type {ArStage} from '../lib/ar/stage'
  import CameraFeed from '../lib/components/CameraFeed.svelte'
  import Button from '../lib/components/Button.svelte'
  import Icon from '../lib/components/Icon.svelte'

  const r = $derived(game.lastReveal)
  const video = revealVideo()

  let useAr = $state(false)
  let canvas = $state<HTMLCanvasElement | null>(null)
  let stage: ArStage | null = null
  let needsTap = $state(false)
  let posterBroken = $state(false)

  /** Flat panel: drop the shared <video> into the screen box, filling it. */
  function panel(node: Element) {
    Object.assign(video.style, {
      position: 'absolute',
      inset: '0',
      width: '100%',
      height: '100%',
      objectFit: 'cover',
      opacity: '1',
      zIndex: '0',
    })
    node.appendChild(video)
    return () => {
      Object.assign(video.style, {
        position: 'fixed',
        inset: 'auto',
        right: '0',
        bottom: '0',
        width: '2px',
        height: '2px',
        opacity: '0',
        zIndex: '-1',
      })
      document.body.appendChild(video)
    }
  }

  function playNow() {
    video.muted = false
    void video.play().then(() => (needsTap = false)).catch(() => {})
  }

  onMount(() => {
    let disposed = false
    void video.play().catch(() => {})

    const decide = async () => {
      if (ar.supported && ar.permission === 'granted') {
        for (let i = 0; i < 15 && !ar.hasReading && !disposed; i++) {
          await new Promise((res) => setTimeout(res, 100))
        }
      }
      if (disposed) return
      useAr = ar.ready
      await Promise.resolve()

      if (useAr && canvas) {
        const {createArStage} = await import('../lib/ar/stage')
        if (disposed || !canvas) return
        stage = await createArStage(canvas, video, r?.posterUrl)
        stage.showScreen()
      }
      setTimeout(() => haptics.revealLock(), useAr ? 720 : 200)
      setTimeout(() => {
        if (!disposed && video.paused) needsTap = true
      }, 900)
    }
    void decide()

    return () => {
      disposed = true
      stage?.dispose()
      stage = null
      video.pause()
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
  {#if !useAr}
    <div class="screen" {@attach panel}>
      {#if r && posterBroken}
        <div class="ph"></div>
      {/if}
    </div>
  {/if}

  {#if needsTap}
    <button class="tap" onclick={playNow} aria-label="Play the scene">
      <Icon name="play" size={30} />
      <span>Play the scene</span>
    </button>
  {/if}

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
      {/if}
      <Button onclick={next}>{r?.huntComplete ? 'See your result' : 'Next scene'}</Button>
    </div>
  </div>
</div>

<img src={r?.posterUrl} alt="" class="probe-poster" onerror={() => (posterBroken = true)} />

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
  .probe-poster {
    position: fixed;
    width: 1px;
    height: 1px;
    opacity: 0;
    pointer-events: none;
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
    position: relative;
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
  .ph {
    position: absolute;
    inset: 0;
    background: linear-gradient(160deg, #1a2230, #0a0d12);
  }
  .tap {
    position: fixed;
    top: 44%;
    left: 50%;
    transform: translate(-50%, -50%);
    z-index: 12;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--sp-2);
    padding: var(--sp-6);
    border-radius: 999px;
    color: var(--text);
    background: rgba(0, 0, 0, 0.4);
    backdrop-filter: blur(8px);
    font-size: var(--step-13);
    letter-spacing: 0.06em;
    text-transform: uppercase;
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
