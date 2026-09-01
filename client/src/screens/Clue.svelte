<script lang="ts">
  /**
   * The screening. The clue *is* the clip — it plays silently on the AR screen
   * in front of you and you work out where on campus it was shot. The same clip
   * comes back with sound, anchored in the real place, once you get there.
   */
  import {nav} from '../lib/stores/nav.svelte'
  import {game} from '../lib/stores/game.svelte'
  import {toasts} from '../lib/stores/toast.svelte'
  import {formatMarquee} from '@cmh/shared'
  import HudBar from '../lib/components/HudBar.svelte'
  import CameraFeed from '../lib/components/CameraFeed.svelte'
  import ArScreen from '../lib/components/ArScreen.svelte'
  import Button from '../lib/components/Button.svelte'
  import Icon from '../lib/components/Icon.svelte'

  const clue = $derived(game.clue)
  const free = $derived(game.freeViewsLeft)
  let screen = $state<ReturnType<typeof ArScreen> | null>(null)
  let usedAr = $state(false)

  // The screening that opens a level is the first of the two free viewings —
  // registered here so the counter the player sees matches the server's.
  let counted = -1
  $effect(() => {
    const level = game.level
    if (counted === level) return
    counted = level
    void game.view()
  })

  /** Watching again is metered: two a level are free, the rest cost time. */
  function replay(): void {
    screen?.replay()
    void game.view().then((penaltyMs) => {
      if (penaltyMs > 0) toasts.show(`Watched again — +${formatMarquee(penaltyMs)}`, 'alert')
    })
  }
</script>

<CameraFeed />

<ArScreen
  bind:this={screen}
  clipUrl={clue?.clipUrl}
  posterUrl={clue?.posterUrl}
  muted={true}
  onshown={(ar) => (usedAr = ar)}
/>

<HudBar />

<div class="ui">
  <p class="label">Level {game.level} — where was this filmed?</p>

  <div class="card">
    <p class="far">{clue?.clueText.far ?? ''}</p>
    <div class="row">
      <button class="ghost" onclick={replay}>
        <Icon name="refresh" size={18} />
        {free > 0 ? `Replay · ${free} free` : 'Replay · costs time'}
      </button>
      {#if usedAr}
        <button class="ghost" onclick={() => screen?.recenter()}>
          <Icon name="crosshair" size={18} /> Recentre
        </button>
      {/if}
    </div>
    <Button onclick={() => nav.go('search')}>Start searching</Button>
  </div>
</div>

<style>
  .ui {
    position: fixed;
    inset: 0;
    z-index: 10;
    display: flex;
    flex-direction: column;
    justify-content: flex-end;
    gap: var(--sp-3);
    padding: calc(var(--safe-top) + 72px) var(--edge) calc(var(--safe-bottom) + var(--sp-5));
    pointer-events: none;
  }
  .ui :global(button) {
    pointer-events: auto;
  }
  .label {
    text-align: center;
    font-family: var(--font-mono);
    font-size: var(--step-13);
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: var(--text-dim);
    text-shadow: 0 1px 6px #000;
    margin: 0 auto;
  }
  .card {
    width: 100%;
    max-width: 520px;
    margin: 0 auto;
    padding: var(--sp-4);
    border-radius: var(--radius-card);
    background: var(--surface-raised);
    backdrop-filter: blur(var(--blur));
    border: var(--glass-border);
    border-top-color: var(--hairline-bright);
    animation: rise 0.7s var(--ease-spring) both;
  }
  .far {
    margin: 0 0 var(--sp-3);
    font-size: var(--step-17);
    line-height: 1.4;
  }
  .row {
    display: flex;
    gap: var(--sp-2);
    margin-bottom: var(--sp-3);
  }
  .ghost {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 8px 14px;
    border-radius: 999px;
    border: var(--glass-border);
    color: var(--text-dim);
    font-size: var(--step-13);
  }
  .card :global(.primary) {
    width: 100%;
  }
  @keyframes rise {
    from {
      transform: translateY(14px);
      opacity: 0;
    }
  }
</style>
