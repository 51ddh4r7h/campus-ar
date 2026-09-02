<script lang="ts">
  import {formatMarquee} from '@cmh/shared'
  import {clock} from '../stores/clock.svelte'
  import {game} from '../stores/game.svelte'
  import Icon from './Icon.svelte'
  import FilmStrip from './FilmStrip.svelte'

  const {faded = false}: {faded?: boolean} = $props()
</script>

<div class="hud" class:faded>
  <div class="chip timer">
    <Icon name="timer" size={15} />
    <span>{formatMarquee(clock.elapsedMs)}</span>
  </div>
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
  .timer span {
    font-family: var(--font-mono);
    font-size: var(--step-15);
    font-variant-numeric: tabular-nums;
    color: var(--amber);
  }
</style>
