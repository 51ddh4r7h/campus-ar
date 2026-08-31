<script lang="ts">
  /**
   * The cinemascope screen, wherever it's needed: floating in front of you at
   * the start of a level (the clue), and anchored in the real place at the end
   * (the reward). Owns the three.js stage and the shared <video>, and falls
   * back to a flat letterbox panel when the device can't do AR.
   */
  import {onMount} from 'svelte'
  import {ar} from '../stores/ar.svelte'
  import {revealVideo} from '../reveal-video'
  import type {ArStage} from '../ar/stage'

  interface Props {
    clipUrl: string | undefined
    posterUrl: string | undefined
    muted: boolean
    /** 0-1 assembly progress, or null to fade in on a timer. */
    build?: number | null
    heat?: number
    /** Fires once the screen is up, with whether it's the real AR stage. */
    onshown?: (usedAr: boolean) => void
  }

  const {clipUrl, posterUrl, muted, build = null, heat = 100, onshown}: Props = $props()

  const video = revealVideo()
  let canvas = $state<HTMLCanvasElement | null>(null)
  let useAr = $state(false)
  let ready = $state(false)
  let needsTap = $state(false)
  let broken = $state(false)
  let stage: ArStage | null = null

  export function recenter(): void {
    stage?.recenter()
  }
  export function replay(): void {
    video.currentTime = 0
    void video.play().catch(() => {})
  }

  /** Flat fallback: park the shared <video> inside the panel box. */
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

  function play(): void {
    if (video.error) {
      broken = true
      return
    }
    void video
      .play()
      .then(() => (needsTap = false))
      .catch(() => {
        // Blocked unmuted: a silent picture beats no picture.
        video.muted = true
        void video
          .play()
          .then(() => (needsTap = false))
          .catch(() => (needsTap = true))
      })
  }

  onMount(() => {
    let disposed = false

    if (clipUrl && video.getAttribute('src') !== clipUrl) {
      video.src = clipUrl
      video.load()
    }
    video.muted = muted
    const onError = () => (broken = true)
    video.addEventListener('error', onError)
    play()

    const start = async () => {
      await ar.ensure()
      if (ar.worthTrying) {
        for (let i = 0; i < 18 && !ar.hasReading && !disposed; i++) {
          await new Promise((res) => setTimeout(res, 100))
        }
      }
      if (disposed) return
      useAr = ar.worthTrying && canvas !== null
      await Promise.resolve()

      if (useAr && canvas) {
        try {
          const {createArStage} = await import('../ar/stage')
          if (disposed || !canvas) return
          stage = await createArStage(canvas, video, posterUrl)
          stage.setHeat(heat)
          if (build !== null) stage.setBuild(build)
          stage.showScreen({assemble: build !== null})
        } catch {
          useAr = false
        }
      }
      ready = true
      onshown?.(useAr)
      setTimeout(() => {
        if (disposed) return
        // A missing clip is a content gap, not something a tap can fix — show
        // the empty screen rather than a button that does nothing.
        if (video.error) broken = true
        else if (video.paused) needsTap = true
      }, 1200)
    }
    void start()

    return () => {
      disposed = true
      video.removeEventListener('error', onError)
      stage?.dispose()
      stage = null
      video.pause()
    }
  })

  $effect(() => {
    if (build !== null) stage?.setBuild(build)
  })
  $effect(() => {
    stage?.setHeat(heat)
  })
  $effect(() => {
    video.muted = muted
    if (!muted && video.paused) play()
  })
</script>

<canvas bind:this={canvas} class="ar-canvas" class:hidden={!useAr || !ready}></canvas>

{#if ready && !useAr}
  <div class="flat">
    <div class="panel" style="opacity: {build === null ? 1 : Math.max(0.08, build)}" {@attach panel}></div>
  </div>
{/if}

{#if broken}
  <p class="broken">Scene footage unavailable — go by the clue</p>
{:else if needsTap}
  <button class="tap" onclick={play}>▶ Play the scene</button>
{/if}

<style>
  .ar-canvas {
    position: fixed;
    inset: 0;
    /* Explicit, so the canvas never falls back to its backing-store size. */
    width: 100%;
    height: 100%;
    z-index: 5;
    pointer-events: none;
  }
  .hidden {
    display: none;
  }
  .flat {
    position: fixed;
    inset: 0;
    z-index: 5;
    display: grid;
    place-items: center;
    padding: var(--edge);
    pointer-events: none;
  }
  .panel {
    position: relative;
    width: 100%;
    max-width: 520px;
    aspect-ratio: 2.39 / 1;
    border-radius: 10px;
    overflow: hidden;
    background: #05060a;
    transition: opacity 0.4s linear;
    box-shadow:
      0 0 0 1px rgba(255, 255, 255, 0.14),
      0 24px 80px rgba(232, 165, 76, 0.26);
  }
  .broken {
    position: fixed;
    top: 46%;
    left: 0;
    right: 0;
    z-index: 12;
    margin: 0;
    text-align: center;
    font-family: var(--font-mono);
    font-size: var(--step-13);
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: var(--text-dim);
    pointer-events: none;
  }
  .tap {
    position: fixed;
    top: 46%;
    left: 50%;
    transform: translate(-50%, -50%);
    z-index: 12;
    padding: var(--sp-3) var(--sp-5);
    border-radius: 999px;
    color: var(--text);
    background: rgba(0, 0, 0, 0.5);
    backdrop-filter: blur(8px);
    font-size: var(--step-13);
    letter-spacing: 0.06em;
    text-transform: uppercase;
  }
</style>
