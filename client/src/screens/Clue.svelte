<script lang="ts">
  import {nav} from '../lib/stores/nav.svelte'
  import {game} from '../lib/stores/game.svelte'
  import HudBar from '../lib/components/HudBar.svelte'
  import Letterbox from '../lib/components/Letterbox.svelte'
  import Button from '../lib/components/Button.svelte'
  import Icon from '../lib/components/Icon.svelte'

  const clue = $derived(game.clue)
  let muted = $state(true)
  let videoBroken = $state(false)
  let posterBroken = $state(false)
  let video = $state<HTMLVideoElement | null>(null)

  function replay() {
    if (video) {
      video.currentTime = 0
      void video.play()
    }
  }
</script>

<HudBar />
<main>
  <div class="stack">
    <p class="label">Level {game.level} — scene</p>
    <Letterbox glow>
      {#if clue && !videoBroken}
        <video
          bind:this={video}
          src={clue.clipUrl}
          poster={clue.posterUrl}
          {muted}
          loop
          autoplay
          playsinline
          onerror={() => (videoBroken = true)}
        ></video>
      {:else if clue && !posterBroken}
        <img src={clue.posterUrl} alt="" loading="eager" onerror={() => (posterBroken = true)} />
      {:else}
        <div class="shimmer"></div>
      {/if}
      <span class="tag">Scene 0{game.level}</span>
    </Letterbox>
    <div class="controls">
      <button aria-label="Replay" onclick={replay}><Icon name="refresh" size={20} /></button>
      <button aria-label={muted ? 'Unmute' : 'Mute'} onclick={() => (muted = !muted)}>
        <Icon name={muted ? 'mute' : 'sound'} size={20} />
      </button>
      <p class="far">{clue?.clueText.far ?? ''}</p>
    </div>
  </div>
  <div class="actions">
    <Button onclick={() => nav.go('search')}>Start searching</Button>
    <Button variant="text" onclick={replay}>Show the clip again later</Button>
  </div>
</main>

<style>
  main {
    min-height: 100dvh;
    display: flex;
    flex-direction: column;
    padding: calc(var(--safe-top) + 72px) var(--edge) calc(var(--safe-bottom) + var(--sp-6));
  }
  .stack {
    flex: 1;
    display: flex;
    flex-direction: column;
    justify-content: center;
    gap: var(--sp-4);
  }
  .label {
    text-align: center;
    font-family: var(--font-mono);
    font-size: var(--step-13);
    letter-spacing: 0.14em;
    text-transform: uppercase;
    color: var(--text-dim);
    margin: 0;
  }
  .tag {
    position: absolute;
    right: 10px;
    bottom: 8px;
    font-family: var(--font-mono);
    font-size: var(--step-13);
    color: var(--text);
    text-shadow: 0 1px 4px #000;
  }
  .shimmer {
    width: 100%;
    height: 100%;
    background: linear-gradient(100deg, #14161a 30%, #20242a 50%, #14161a 70%);
    background-size: 200% 100%;
    animation: sweep 1.4s linear infinite;
  }
  .controls {
    display: flex;
    align-items: center;
    gap: var(--sp-3);
  }
  .controls button {
    color: var(--text-dim);
    padding: var(--sp-2);
  }
  .far {
    margin: 0 0 0 auto;
    text-align: right;
    color: var(--text);
    font-size: var(--step-15);
    max-width: 24ch;
  }
  .actions {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--sp-2);
  }
  .actions :global(.primary) {
    width: 100%;
  }
  @keyframes sweep {
    to {
      background-position: -200% 0;
    }
  }
</style>
