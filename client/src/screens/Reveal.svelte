<script lang="ts">
  import {formatMarquee} from '@cmh/shared'
  import {nav} from '../lib/stores/nav.svelte'
  import {game} from '../lib/stores/game.svelte'
  import {toasts} from '../lib/stores/toast.svelte'
  import Button from '../lib/components/Button.svelte'
  import Icon from '../lib/components/Icon.svelte'

  const r = $derived(game.lastReveal)
  let videoBroken = $state(false)
  let posterBroken = $state(false)

  function next() {
    if (r?.huntComplete) {
      nav.go('finish')
    } else {
      nav.go('clue')
    }
  }
</script>

<div class="reveal">
  <div class="bars top"></div>
  <div class="screen">
    {#if r && !videoBroken}
      <video src={r.clipUrl} poster={r.posterUrl} autoplay loop playsinline onerror={() => (videoBroken = true)}>
        <track kind="captions" />
      </video>
    {:else if r && !posterBroken}
      <img src={r.posterUrl} alt="" onerror={() => (posterBroken = true)} />
    {:else}
      <div class="placeholder"></div>
    {/if}
    <div class="spill"></div>
  </div>
  <div class="bars bottom">
    <div class="info">
      <p class="mono">Level {r?.level} · split {formatMarquee(r?.splitMs ?? 0)}{r?.penaltyMs ? ` · +${formatMarquee(r.penaltyMs)}` : ''}</p>
      <h1>{r?.locationName}</h1>
      <p class="film"><b>{r?.movie.title}</b> · filmed here</p>
      <div class="fact">{r?.campusFact}</div>
      <div class="actions">
        <Button variant="secondary" onclick={() => toasts.show('Photo mode arrives with the AR build')}>
          <Icon name="camera" size={18} /> Take a photo
        </Button>
        <Button onclick={next}>{r?.huntComplete ? 'See your result' : 'Next scene'}</Button>
      </div>
    </div>
  </div>
</div>

<style>
  .reveal {
    position: fixed;
    inset: 0;
    background: #000;
    display: grid;
    grid-template-rows: 12vh 1fr auto;
    animation: fade 0.6s ease;
  }
  .bars {
    background: #000;
  }
  .screen {
    position: relative;
    overflow: hidden;
    background: #05060a;
  }
  .screen video,
  .screen img,
  .screen .placeholder {
    width: 100%;
    height: 100%;
    object-fit: cover;
    animation: rise 0.9s var(--ease-spring);
  }
  .placeholder {
    background: linear-gradient(160deg, #1a2230, #0a0d12);
  }
  .spill {
    position: absolute;
    inset: 0;
    background: radial-gradient(80% 60% at 50% 100%, rgba(232, 165, 76, 0.22), transparent 70%);
    pointer-events: none;
  }
  .bottom {
    padding: var(--sp-4) var(--edge) calc(var(--safe-bottom) + var(--sp-4));
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
    background: var(--surface);
    border: var(--glass-border);
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
      transform: scale(0.9);
      opacity: 0;
    }
  }
  @keyframes fade {
    from {
      opacity: 0;
    }
  }
</style>
