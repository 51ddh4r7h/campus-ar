<script lang="ts">
  import type {HintRung} from '@cmh/shared'
  import {formatMarquee} from '@cmh/shared'
  import {game} from '../lib/stores/game.svelte'
  import {toasts} from '../lib/stores/toast.svelte'
  import Sheet from '../lib/components/Sheet.svelte'
  import Icon from '../lib/components/Icon.svelte'

  interface Rung {
    key: HintRung
    title: string
    penaltyMs: number
    unlockedText: string | null
  }

  const rungs = $derived<Rung[]>([
    {key: 'warm', title: 'Hint 1 — a nudge', penaltyMs: 90_000, unlockedText: game.clue?.clueText.warm ?? null},
    {key: 'close', title: 'Hint 2 — almost there', penaltyMs: 90_000, unlockedText: game.clue?.clueText.close ?? null},
    {key: 'showLocation', title: 'Show me the location', penaltyMs: 300_000, unlockedText: game.clue?.revealPoint ? 'Shown on the map' : null},
  ])
  const used = $derived(game.session?.currentLevelHints ?? 0)
  let pending = $state<HintRung | null>(null)

  async function take(r: Rung, index: number) {
    if (index !== used) return
    pending = r.key
    try {
      const penalty = await game.hint(r.key)
      toasts.show(`Penalty +${formatMarquee(penalty)} applied`, 'alert')
    } catch {
      toasts.show('That hint is not available yet', 'alert')
    }
    pending = null
  }
</script>

<Sheet title="Take a hint" height="58%">
  <p class="lead">Each hint adds time. Everyone pays the same.</p>
  <ul>
    {#each rungs as r, i}
      <li class:locked={i > used}>
        <div class="row">
          <div>
            <strong>{r.title}</strong>
            <span class="cost">+{formatMarquee(r.penaltyMs)}</span>
          </div>
          {#if i < used}
            <span class="tag">Used</span>
          {:else if i === used}
            <button class="use" disabled={pending !== null} onclick={() => take(r, i)}>
              {pending === r.key ? '…' : 'Use hint'}
            </button>
          {:else}
            <span class="tag lock"><Icon name="lock" size={14} /> Locked</span>
          {/if}
        </div>
        {#if r.unlockedText && i < used}
          <p class="revealed">{r.unlockedText}</p>
        {/if}
      </li>
    {/each}
  </ul>
</Sheet>

<style>
  .lead {
    color: var(--text-dim);
    font-size: var(--step-15);
    margin: 0 0 var(--sp-4);
  }
  ul {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
  }
  li {
    padding: var(--sp-4) 0;
    border-top: 1px solid var(--hairline);
  }
  li.locked {
    opacity: 0.45;
  }
  .row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--sp-3);
  }
  strong {
    display: block;
    font-weight: 600;
  }
  .cost {
    font-family: var(--font-mono);
    font-size: var(--step-13);
    color: var(--amber);
  }
  .use {
    padding: 8px 16px;
    border-radius: 999px;
    border: 1px solid var(--amber);
    color: var(--amber);
    font-weight: 600;
    font-size: var(--step-15);
    white-space: nowrap;
  }
  .tag {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    font-size: var(--step-13);
    color: var(--text-dim);
    text-transform: uppercase;
    letter-spacing: 0.06em;
  }
  .revealed {
    margin: var(--sp-3) 0 0;
    color: var(--text);
    font-size: var(--step-15);
  }
</style>
