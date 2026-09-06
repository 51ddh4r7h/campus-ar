<script lang="ts">
  import {formatMarquee} from '@cmh/shared'
  import {clock} from '../stores/clock.svelte'
  import {game} from '../stores/game.svelte'
  import Icon from './Icon.svelte'
  import FilmStrip from './FilmStrip.svelte'
  import {nav} from '../stores/nav.svelte'
  import {toasts} from '../stores/toast.svelte'

  const {faded = false}: {faded?: boolean} = $props()

  let busy = $state(false)

  /**
   * Tap the clock to stop the clock.
   *
   * No new furniture in a HUD that already carries Hint, Compare and
   * Standings, and the meaning is hard to mistake. It hands off to the ready
   * screen, which is the paused state: the RESUME there is a real user
   * gesture, which is what the camera needs to come back.
   */
  async function pause() {
    if (busy || !game.inProgress) return
    busy = true
    try {
      await game.pause()
      nav.go('ready')
    } catch {
      toasts.show('Could not pause — try again', 'alert')
    } finally {
      busy = false
    }
  }
</script>

<div class="hud" class:faded>
  <button
    class="chip timer"
    disabled={busy || !game.inProgress}
    onclick={() => void pause()}
    aria-label="Pause the hunt"
  >
    <Icon name="timer" size={15} />
    <span>{formatMarquee(clock.elapsedMs)}</span>
    {#if game.inProgress}<span class="bars" aria-hidden="true"></span>{/if}
  </button>
  <div class="chip">
    <FilmStrip splits={game.splits} current={game.inProgress ? game.level : 0} />
  </div>
</div>

<style>
  .hud {
    position: fixed;
    top: calc(var(--safe-top) + var(--sp-2));
    left: var(--edge);
    right: var(--edge);
    display: flex;
    justify-content: space-between;
    z-index: 20;
    pointer-events: none;
    transition: opacity var(--dur-standard) var(--ease-spring);
  }
  .faded {
    opacity: 0;
  }
  .chip {
    display: flex;
    align-items: center;
    gap: var(--sp-2);
    padding: 7px 12px;
    border-radius: 999px;
    background: var(--surface);
    backdrop-filter: blur(var(--blur));
    border: var(--glass-border);
    border-top-color: var(--hairline-bright);
  }
  .timer {
    /* The HUD is pointer-events:none so it never eats taps meant for the world;
       the one control in it has to opt back in. */
    pointer-events: auto;
  }
  /* The universal pause glyph, drawn rather than imported. */
  .bars {
    width: 8px;
    height: 10px;
    border-left: 2.5px solid var(--text-dim);
    border-right: 2.5px solid var(--text-dim);
    margin-left: 2px;
  }
  .timer span {
    font-family: var(--font-mono);
    font-size: var(--step-15);
    font-variant-numeric: tabular-nums;
    color: var(--amber);
  }
</style>
