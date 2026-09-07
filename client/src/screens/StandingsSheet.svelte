<script lang="ts">
  import {elapsedMsOf, formatMarquee, formatScore, type StandingRow} from '@cmh/shared'
  import {standings} from '../lib/stores/standings.svelte'
  import {clock} from '../lib/stores/clock.svelte'
  import Sheet from '../lib/components/Sheet.svelte'

  function ordinal(n: number): string {
    const tens = n % 100
    if (tens >= 11 && tens <= 13) return `${n}th`
    const ones = n % 10
    return `${n}${ones === 1 ? 'st' : ones === 2 ? 'nd' : ones === 3 ? 'rd' : 'th'}`
  }

  /**
   * Everyone's clock, running.
   *
   * The board used to say only "Level 3" for anyone still out there, so you
   * could see who was ahead of you but not by how much — and on a course this
   * short, the gap is the whole race. `clock.now` ticks four times a second and
   * every row derives from it, so this needs no timer of its own.
   *
   * `elapsedMsOf` is the same function the player's own clock and the server's
   * scoring use, which is why a paused rival's time visibly stops rather than
   * drifting away from what they see on their phone.
   */
  const runningMs = (r: StandingRow): number => elapsedMsOf(r.timing, clock.now)

  let tab = $state<'overall' | 'level'>('overall')
  const self = $derived(standings.self)
  const rows = $derived(
    tab === 'overall'
      ? standings.rows
      : standings.rows.filter((r) => r.level !== null && r.level === self?.level),
  )
</script>

<Sheet title="Standings" height="80%">
  <div class="tabs">
    <button class:on={tab === 'overall'} onclick={() => (tab = 'overall')}>Overall</button>
    <button class:on={tab === 'level'} onclick={() => (tab = 'level')}>Your level</button>
  </div>
  <p class="cap">Finished: vs par, lower is better · Still out: time on the clock</p>

  {#if self}
    <div class="you">
      <span>You're <b>{ordinal(self.rank)}</b></span>
      <span class="score">{self.scoreMs === null ? formatMarquee(runningMs(self)) : formatScore(self.scoreMs)}</span>
    </div>
  {/if}

  {#if rows.length === 0}
    <p class="empty">Standings open once the first player starts.</p>
  {:else}
    <ol>
      {#each rows as r (r.rank)}
        <li class:me={r.isSelf}>
          <span class="rank">{r.rank}</span>
          <span class="name">
            {r.playerName}
            {#if r.scoreMs === null}
              <small class:paused={r.paused}>
                {r.paused ? 'Paused' : `Level ${r.level}`}
              </small>
            {/if}
          </span>
          <span class="val" class:live={r.scoreMs === null && !r.paused}>
            {r.scoreMs === null ? formatMarquee(runningMs(r)) : formatScore(r.scoreMs)}
          </span>
        </li>
      {/each}
    </ol>
  {/if}
</Sheet>

<style>
  .tabs {
    display: flex;
    gap: 4px;
    padding: 4px;
    border-radius: 12px;
    background: rgba(0, 0, 0, 0.3);
    border: 1px solid var(--hairline);
  }
  .tabs button {
    flex: 1;
    padding: 10px;
    border-radius: 9px;
    color: var(--text-dim);
    font-weight: 600;
    font-size: var(--step-15);
  }
  .tabs button.on {
    background: var(--surface-raised);
    color: var(--text);
    box-shadow: 0 1px 0 var(--hairline-bright) inset;
  }
  .cap {
    font-size: var(--step-13);
    color: var(--text-faint);
    margin: var(--sp-3) 0 var(--sp-4);
  }
  .name small {
    display: block;
    font-size: var(--step-13);
    font-weight: 400;
    color: var(--text-faint);
  }
  .name small.paused {
    color: var(--amber);
  }
  /* A running clock reads as the live thing on the row; a finished score is
     settled, and shouldn't compete with it for attention. */
  .val.live {
    color: var(--text);
  }
  li.me .val.live {
    color: var(--amber);
  }
  .you {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    padding: var(--sp-4);
    border-radius: 14px;
    background: linear-gradient(120deg, rgba(232, 165, 76, 0.16), rgba(232, 165, 76, 0.04));
    margin-bottom: var(--sp-4);
  }
  .you b {
    font-size: var(--step-28);
  }
  .you .score {
    font-family: var(--font-mono);
    color: var(--amber);
  }
  ol {
    list-style: none;
    margin: 0;
    padding: 0;
  }
  li {
    display: grid;
    grid-template-columns: 24px 1fr auto;
    gap: var(--sp-3);
    align-items: center;
    padding: var(--sp-4) 0;
    border-top: 1px solid var(--hairline);
  }
  li.me {
    color: var(--amber);
    border: 1px solid var(--amber);
    border-radius: 12px;
    padding-inline: var(--sp-3);
  }
  .rank {
    font-family: var(--font-mono);
    color: var(--text-dim);
  }
  li.me .rank {
    color: var(--amber);
  }
  .name {
    font-weight: 600;
  }
  .val {
    font-family: var(--font-mono);
    font-variant-numeric: tabular-nums;
    color: var(--text-dim);
  }
  li.me .val {
    color: var(--amber);
  }
  .empty {
    color: var(--text-dim);
    text-align: center;
    padding: var(--sp-8) 0;
  }
</style>
