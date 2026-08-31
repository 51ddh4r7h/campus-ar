<script lang="ts">
  import {formatMarquee} from '@cmh/shared'
  import {clock} from '../stores/clock.svelte'
  import {game} from '../stores/game.svelte'
  import Icon from './Icon.svelte'

  const {faded = false}: {faded?: boolean} = $props()

  const dots = $derived(
    Array.from({length: 5}, (_, i) => {
      const level = i + 1
      if (level < game.level) return 'done'
      if (level === game.level && game.inProgress) return 'current'
      return 'locked'
    }),
  )
</script>

<div class="hud" class:faded>
  <div class="chip timer">
    <Icon name="timer" size={15} />
    <span>{formatMarquee(clock.elapsedMs)}</span>
  </div>
  <div class="chip dots" aria-label="Level {game.level} of 5">
    {#each dots as state}
      <i class={state}></i>
    {/each}
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
  .timer span {
    font-family: var(--font-mono);
    font-size: var(--step-15);
    font-variant-numeric: tabular-nums;
    color: var(--amber);
  }
  .dots {
    gap: 5px;
  }
  .dots i {
    width: 14px;
    height: 3px;
    border-radius: 2px;
    background: var(--hairline);
  }
  .dots i.done {
    background: var(--success);
  }
  .dots i.current {
    background: var(--amber);
  }
</style>
