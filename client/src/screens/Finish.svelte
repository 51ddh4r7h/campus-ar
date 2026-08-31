<script lang="ts">
  import {onMount} from 'svelte'
  import {formatMarquee, formatScore, locationById} from '@cmh/shared'
  import {nav} from '../lib/stores/nav.svelte'
  import {game} from '../lib/stores/game.svelte'
  import {standings} from '../lib/stores/standings.svelte'
  import {clock} from '../lib/stores/clock.svelte'
  import {haptics} from '../lib/haptics'
  import {startDemo} from '../lib/demo'
  import {toasts} from '../lib/stores/toast.svelte'
  import Button from '../lib/components/Button.svelte'
  import Icon from '../lib/components/Icon.svelte'

  onMount(() => haptics.fanfare())

  let starting = $state(false)
  async function playAgain() {
    starting = true
    try {
      game.reset()
      await startDemo()
      await game.start()
      nav.go('clue')
    } catch {
      toasts.show('Could not start a new run', 'alert')
      starting = false
    }
  }

  const score = $derived(game.session?.scoreMs ?? 0)
  const self = $derived(standings.self)
  const splits = $derived([...game.splits].sort((a, b) => a.level - b.level))

  // Splits carry a locationId — safe to name now.
  const name = (id: string) => locationById(id)?.name ?? id
</script>

<main>
  <span class="eyebrow">Campus Movie Hunt</span>
  <h1>That's a wrap.</h1>

  <div class="hero">
    <p class="label">{score <= 0 ? 'Under par by' : 'Over par by'}</p>
    <p class="big">{formatMarquee(Math.abs(score))}</p>
    <p class="raw">Total time {formatMarquee(clock.elapsedMs)}</p>
  </div>

  {#if self}
    <p class="rank">
      {#if self.rank <= 3}<Icon name="trophy" size={18} />{/if}
      {self.rank}{#if standings.rows.length} of {standings.rows.length}{/if}
    </p>
  {/if}

  <ol class="splits">
    {#each splits as s}
      <li>
        <span class="n">0{s.level}</span>
        <span class="place">{name(s.locationId)}</span>
        <span class="t">{formatMarquee(s.splitMs)}{#if s.penaltyMs}<em> +{formatMarquee(s.penaltyMs)}</em>{/if}</span>
      </li>
    {/each}
  </ol>

  <div class="actions">
    <Button variant="secondary" onclick={() => nav.open('standings')}>View standings</Button>
    <Button disabled={starting} onclick={playAgain}>{starting ? 'Starting…' : 'Play again'}</Button>
    <Button variant="text" onclick={() => navigator.share?.({title: 'Campus Movie Hunt', text: `I finished ${formatScore(score)} vs par!`})}>
      Share result
    </Button>
  </div>
</main>

<style>
  main {
    min-height: 100dvh;
    display: flex;
    flex-direction: column;
    gap: var(--sp-3);
    padding: calc(var(--safe-top) + var(--sp-8)) var(--edge) calc(var(--safe-bottom) + var(--sp-6));
    background:
      radial-gradient(120% 60% at 50% 0%, rgba(232, 165, 76, 0.08), transparent 60%),
      var(--bg);
  }
  .eyebrow {
    font-size: var(--step-13);
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: var(--text-dim);
  }
  h1 {
    font-family: var(--font-display);
    font-weight: 400;
    font-size: var(--step-40);
    margin: 0 0 var(--sp-4);
  }
  .hero .label {
    font-family: var(--font-mono);
    font-size: var(--step-13);
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: var(--text-dim);
    margin: 0;
  }
  .hero .big {
    font-family: var(--font-mono);
    font-size: 3rem;
    font-variant-numeric: tabular-nums;
    color: var(--amber);
    margin: 2px 0;
  }
  .hero .raw {
    color: var(--text-dim);
    font-family: var(--font-mono);
    margin: 0;
  }
  .rank {
    display: flex;
    align-items: center;
    gap: var(--sp-2);
    font-weight: 600;
    margin: var(--sp-2) 0;
  }
  .rank :global(svg) {
    color: var(--amber);
  }
  .splits {
    list-style: none;
    margin: var(--sp-3) 0;
    padding: 0;
    flex: 1;
  }
  .splits li {
    display: grid;
    grid-template-columns: 28px 1fr auto;
    gap: var(--sp-3);
    padding: var(--sp-3) 0;
    border-top: 1px solid var(--hairline);
  }
  .n {
    font-family: var(--font-mono);
    color: var(--text-faint);
  }
  .place {
    font-weight: 500;
  }
  .t {
    font-family: var(--font-mono);
    font-variant-numeric: tabular-nums;
    color: var(--text-dim);
  }
  .t em {
    color: var(--alert);
    font-style: normal;
  }
  .actions {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--sp-2);
  }
  .actions :global(.primary),
  .actions :global(.secondary) {
    width: 100%;
  }
</style>
