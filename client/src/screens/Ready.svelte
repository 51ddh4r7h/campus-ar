<script lang="ts">
  import {formatMarquee} from '@cmh/shared'
  import {nav} from '../lib/stores/nav.svelte'
  import {game} from '../lib/stores/game.svelte'
  import {clock} from '../lib/stores/clock.svelte'
  import {toasts} from '../lib/stores/toast.svelte'
  import {revealVideo} from '../lib/reveal-video'

  const resuming = $derived(game.inProgress)
  let starting = $state(false)

  async function go() {
    // This tap is the session's one guaranteed user gesture — spend it
    // unblocking the shared <video> so no later scene needs a "tap to play".
    const v = revealVideo()
    v.muted = true
    void v.play().catch(() => {})

    if (resuming) {
      nav.go('clue')
      return
    }
    starting = true
    try {
      await game.start()
      nav.go('clue')
    } catch {
      toasts.show('Could not start — check your connection', 'alert')
      starting = false
    }
  }
</script>

<main>
  {#if game.demo}<span class="chip">Demo</span>{/if}
  <div class="center">
    <p class="label">{resuming ? `You're on level ${game.level}` : "When you're ready"}</p>
    <button class="start" class:busy={starting} onclick={go} disabled={starting}>
      <span>{resuming ? 'RESUME' : 'START'}</span>
    </button>
    {#if resuming}
      <p class="sub mono">{formatMarquee(clock.elapsedMs)}</p>
    {:else}
      <p class="sub">Your timer starts the moment you tap.</p>
    {/if}
    <button class="rules" onclick={() => nav.open('howto')}>Read the rules again</button>
  </div>
</main>

<style>
  main {
    min-height: 100dvh;
    display: grid;
    place-items: center;
    padding: var(--edge);
  }
  .rules {
    margin-top: var(--sp-6);
    padding: var(--sp-2) var(--sp-4);
    border-radius: 999px;
    border: 1px solid var(--hairline);
    color: var(--text-dim);
    font-size: var(--step-13);
  }
  .chip {
    position: fixed;
    top: calc(var(--safe-top) + var(--sp-3));
    right: var(--edge);
    font-size: var(--step-13);
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--text-dim);
    padding: 5px 10px;
    border-radius: 999px;
    background: var(--surface);
    border: var(--glass-border);
  }
  .center {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--sp-6);
    text-align: center;
  }
  .label {
    font-size: var(--step-13);
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: var(--text-dim);
    margin: 0;
  }
  .start {
    width: 148px;
    height: 148px;
    border-radius: 999px;
    border: 2px solid var(--amber);
    background: radial-gradient(circle at 50% 40%, rgba(232, 165, 76, 0.14), transparent 70%);
    color: var(--text);
    font-weight: 700;
    letter-spacing: 0.06em;
    box-shadow: 0 0 40px rgba(232, 165, 76, 0.15);
    transition: transform var(--dur-standard) var(--ease-spring);
    animation: pulse 2.4s ease-in-out infinite;
  }
  .start:active {
    transform: scale(0.95);
    background: var(--amber);
    color: var(--amber-ink);
  }
  .start.busy {
    opacity: 0.6;
    animation: none;
  }
  .sub {
    color: var(--text-dim);
    margin: 0;
    max-width: 28ch;
  }
  .mono {
    font-family: var(--font-mono);
    font-variant-numeric: tabular-nums;
    color: var(--amber);
  }
  @keyframes pulse {
    50% {
      box-shadow: 0 0 60px rgba(232, 165, 76, 0.28);
    }
  }
</style>
