<script lang="ts">
  /**
   * Says the movement is fake — and offers the way out.
   *
   * Both halves were missing. It read "Practice", which is true and not the
   * point: practice drives a GPS simulator that walks between stops on a timer,
   * so levels complete without anyone going anywhere. And there was no exit at
   * all. Starting a practice run replaces the signed-in token with its own, so
   * a player who tried one was left as the practice player with every reload
   * restoring it — stuck, on the badge that was telling them so.
   *
   * The badge is the exit because it is what someone is looking at the moment
   * they realise they are in the wrong mode.
   */
  import {game} from '../stores/game.svelte'
  import {nav} from '../stores/nav.svelte'

  let asking = $state(false)

  function leave() {
    game.reset()
    nav.go('hero')
  }
</script>

{#if asking}
  <div class="sheet" role="dialog" aria-label="Leave practice">
    <p>Leave the practice run?</p>
    <p class="dim">Nothing here is scored. You'll be signed out and can sign back in.</p>
    <div class="row">
      <button class="go" onclick={leave}>Leave practice</button>
      <button class="stay" onclick={() => (asking = false)}>Stay</button>
    </div>
  </div>
{/if}

<button class="badge" onclick={() => (asking = !asking)} aria-expanded={asking}>
  <span class="dot"></span>
  Practice · simulated GPS
</button>

<style>
  .badge {
    position: fixed;
    top: calc(var(--safe-top) + var(--sp-2));
    left: 50%;
    transform: translateX(-50%);
    z-index: 65;
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 5px 12px;
    border-radius: 999px;
    font-size: var(--step-13);
    font-weight: 600;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: var(--amber-ink);
    background: var(--amber);
    box-shadow: 0 2px 12px rgba(0, 0, 0, 0.5);
    white-space: nowrap;
  }
  /* A slow blink: static chrome stops being read after a minute or two. */
  .dot {
    width: 7px;
    height: 7px;
    border-radius: 999px;
    background: var(--amber-ink);
    animation: pulse 2s ease-in-out infinite;
  }
  @keyframes pulse {
    50% {
      opacity: 0.25;
    }
  }
  .sheet {
    position: fixed;
    top: calc(var(--safe-top) + 44px);
    left: 50%;
    transform: translateX(-50%);
    z-index: 66;
    width: min(320px, calc(100vw - 2 * var(--edge)));
    padding: var(--sp-4);
    border-radius: var(--radius-card);
    background: var(--surface-raised);
    backdrop-filter: blur(var(--blur));
    border: var(--glass-border);
    box-shadow: var(--glass-shadow);
    text-align: center;
  }
  .sheet p {
    margin: 0 0 var(--sp-2);
    font-size: var(--step-15);
  }
  .dim {
    color: var(--text-dim);
    font-size: var(--step-13);
  }
  .row {
    display: flex;
    gap: var(--sp-2);
    margin-top: var(--sp-3);
  }
  .row button {
    flex: 1;
    min-height: 40px;
    border-radius: 999px;
    font-size: var(--step-14);
  }
  .go {
    background: var(--amber);
    color: var(--amber-ink);
    font-weight: 600;
  }
  .stay {
    border: 1px solid var(--hairline);
    color: var(--text-dim);
  }
  @media (prefers-reduced-motion: reduce) {
    .dot {
      animation: none;
    }
  }
</style>
