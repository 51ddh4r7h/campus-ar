<script lang="ts">
  import {nav} from '../lib/stores/nav.svelte'
  import {game} from '../lib/stores/game.svelte'
  import {location} from '../lib/stores/location.svelte'
  import {toasts} from '../lib/stores/toast.svelte'
  import HudBar from '../lib/components/HudBar.svelte'
  import CameraFeed from '../lib/components/CameraFeed.svelte'
  import HeatMeter from '../lib/components/HeatMeter.svelte'
  import Icon from '../lib/components/Icon.svelte'

  const clue = $derived(game.clue)
  let comparing = $state(false)

  const reticle = $derived(
    !location.hasSignal ? 'searching' : location.fix && location.fixAgeMs < 4000 ? 'ok' : 'searching',
  )
</script>

<CameraFeed />

<HudBar />
<HeatMeter />

<button class="compare-thumb" onclick={() => (comparing = true)}>
  {#if clue}<img src={clue.posterUrl} alt="" />{/if}
  <span>Compare</span>
</button>

<div class="reticle {reticle}">
  <i></i><i></i><i></i><i></i>
</div>

{#if !location.hasSignal}
  <p class="hint-line">Move slowly to get a signal.</p>
{/if}

{#if comparing && clue}
  <button class="ghost" onclick={() => (comparing = false)}>
    <img src={clue.sceneRefImage} alt="" />
    <p>Line it up with what's in front of you.</p>
    <span class="close"><Icon name="x" size={20} /></span>
  </button>
{/if}

<nav class="bar">
  <button onclick={() => nav.open('hint')}><Icon name="bulb" size={22} /><span>Hint</span></button>
  <button onclick={() => toasts.show('Recentred')}><Icon name="crosshair" size={22} /><span>Recentre</span></button>
  <button onclick={() => nav.open('standings')}><Icon name="trophy" size={22} /><span>Standings</span></button>
</nav>

<style>
  .compare-thumb {
    position: fixed;
    top: calc(var(--safe-top) + 52px);
    left: var(--edge);
    z-index: 20;
    width: 128px;
    border-radius: 12px;
    overflow: hidden;
    background: var(--surface);
    backdrop-filter: blur(var(--blur));
    border: var(--glass-border);
  }
  .compare-thumb img {
    width: 100%;
    aspect-ratio: 16/9;
    object-fit: cover;
    display: block;
  }
  .compare-thumb span {
    display: block;
    padding: 5px 8px;
    font-size: var(--step-13);
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--text-dim);
  }
  .reticle {
    position: fixed;
    top: 50%;
    left: 50%;
    width: 54%;
    max-width: 260px;
    aspect-ratio: 1;
    transform: translate(-50%, -50%);
    z-index: 10;
    animation: breathe 3s ease-in-out infinite;
  }
  .reticle i {
    position: absolute;
    width: 22px;
    height: 22px;
    border: 2px solid var(--amber);
    opacity: 0.65;
  }
  .reticle.ok i {
    opacity: 0.95;
  }
  .reticle i:nth-child(1) {
    top: 0;
    left: 0;
    border-right: 0;
    border-bottom: 0;
  }
  .reticle i:nth-child(2) {
    top: 0;
    right: 0;
    border-left: 0;
    border-bottom: 0;
  }
  .reticle i:nth-child(3) {
    bottom: 0;
    left: 0;
    border-right: 0;
    border-top: 0;
  }
  .reticle i:nth-child(4) {
    bottom: 0;
    right: 0;
    border-left: 0;
    border-top: 0;
  }
  .hint-line {
    position: fixed;
    top: 62%;
    left: 0;
    right: 0;
    text-align: center;
    color: var(--text-dim);
    font-size: var(--step-15);
    z-index: 10;
  }
  .ghost {
    position: fixed;
    inset: 0;
    z-index: 30;
    display: block;
    width: 100%;
    background: rgba(0, 0, 0, 0.35);
  }
  .ghost img {
    position: absolute;
    top: 50%;
    left: 50%;
    width: 78%;
    transform: translate(-50%, -50%);
    opacity: 0.5;
    border: 2px solid var(--amber);
    border-radius: 8px;
  }
  .ghost p {
    position: absolute;
    top: calc(var(--safe-top) + 92px);
    left: 0;
    right: 0;
    text-align: center;
    color: var(--text);
  }
  .ghost .close {
    position: absolute;
    top: calc(var(--safe-top) + 12px);
    right: var(--edge);
    color: var(--text);
  }
  .bar {
    position: fixed;
    left: var(--edge);
    right: var(--edge);
    bottom: calc(var(--safe-bottom) + var(--sp-3));
    z-index: 20;
    display: flex;
    justify-content: space-around;
    padding: var(--sp-3) var(--sp-2);
    border-radius: var(--radius-card);
    background: var(--surface);
    backdrop-filter: blur(var(--blur));
    border: var(--glass-border);
    border-top-color: var(--hairline-bright);
    box-shadow: var(--glass-shadow);
  }
  .bar button {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 4px;
    color: var(--text);
    font-size: var(--step-13);
    padding: var(--sp-1) var(--sp-4);
  }
  .bar :global(svg) {
    color: var(--amber);
  }
  @keyframes breathe {
    50% {
      transform: translate(-50%, -50%) scale(1.04);
    }
  }
</style>
