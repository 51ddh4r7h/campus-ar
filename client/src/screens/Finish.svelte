<script lang="ts">
  import {onMount} from 'svelte'
  import {
    LEVEL_COUNT,
    formatMarquee,
    formatScore,
    locationById,
    perksEarned,
  } from '@cmh/shared'
  import {nav} from '../lib/stores/nav.svelte'
  import {game} from '../lib/stores/game.svelte'
  import {standings} from '../lib/stores/standings.svelte'
  import {clock} from '../lib/stores/clock.svelte'
  import {haptics} from '../lib/haptics'
  import {startDemo} from '../lib/demo'
  import {demoAllowed} from '../lib/mode'
  import {toasts} from '../lib/stores/toast.svelte'
  import {ApiError} from '../lib/api'
  import {readableError} from '../lib/errors'
  import Button from '../lib/components/Button.svelte'
  import Icon from '../lib/components/Icon.svelte'
  import {rungIcon} from '../lib/rung-icons'
  import CampusMap from '../lib/components/CampusMap.svelte'
  import FilmStrip from '../lib/components/FilmStrip.svelte'
  import Confetti from '../lib/components/Confetti.svelte'

  onMount(() => haptics.fanfare())

  let starting = $state(false)

  /**
   * Practice gets another throwaway simulated session. A signed-in player keeps
   * their account and swaps the ended run for a clean route, then returns to
   * the start line — its START tap gives Safari the gesture the camera needs,
   * and makes the moment the new clock begins unambiguous.
   *
   * The new route avoids the stops they already walked as far as the pool
   * allows, so a second run is not a re-walk of the first.
   */
  async function playAgain() {
    starting = true
    try {
      if (demoAllowed) {
        game.reset()
        await startDemo()
      } else {
        await game.replay()
      }
      nav.go('ready')
    } catch (err) {
      toasts.show(
        err instanceof ApiError
          ? readableError(err.code, 'Could not prepare a new hunt — try again')
          : "Can't reach the server — check your connection",
        'alert',
      )
      starting = false
    }
  }

  const score = $derived(game.session?.scoreMs ?? 0)
  const self = $derived(standings.self)
  const splits = $derived([...game.splits].sort((a, b) => a.level - b.level))

  // Splits carry a locationId — safe to name now.
  const name = (id: string) => locationById(id)?.name ?? id

  const earned = $derived(perksEarned(splits.length))
  /** Location ids in the order they were reached — the player's own route. */
  const visited = $derived(splits.map((s) => s.locationId))
  /** Rung 5: the half of campus a randomised route never sent you to. */
  const wrapped = $derived(game.complete)

  /**
   * Ran out of time, as opposed to choosing to stop.
   *
   * Both end as `abandoned`, so the clock is what tells them apart: a hunt
   * that timed out has used every second of the limit and has none left, and
   * one somebody ended at eight minutes has seventeen still on it.
   */
  const timedOut = $derived(game.abandoned && clock.remainingMs === 0)

  /** A shared phone needs a way to hand the next player a clean slate. */
  function signOut() {
    game.reset()
    nav.go('hero')
  }

  /** Share on phones; copy on browsers without a native share sheet. */
  async function shareResult() {
    const text = game.abandoned
      ? `I found ${splits.length} of ${LEVEL_COUNT} scenes in Campus Movie Hunt.`
      : `I finished Campus Movie Hunt ${formatScore(score)} vs par!`
    try {
      if (navigator.share) {
        await navigator.share({title: 'Campus Movie Hunt', text})
        return
      }
      await navigator.clipboard.writeText(text)
      toasts.show('Result copied')
    } catch {
      toasts.show("Couldn't share this result", 'alert')
    }
  }
</script>

<!-- Only for a hunt that was actually finished. On an abandoned one this
     would be a taunt, and `game.complete` is the difference. -->
{#if game.complete}<Confetti />{/if}

<main>
  <span class="eyebrow">Campus Movie Hunt</span>
  <!-- An abandoned hunt is not a finished one, and saying so is kinder than a
       congratulation nobody earned. The whole-campus map stays behind `wrapped`
       for the same reason: it is the reward for going the distance. -->
  <h1>{timedOut ? 'Time’s up.' : game.abandoned ? 'Called it a day.' : 'That’s a wrap.'}</h1>
  {#if game.abandoned}
    <p class="stopped">
      {#if splits.length === 0}
        {timedOut ? 'Time ran out' : 'You stopped'} before finding a scene.
      {:else}
        {timedOut ? 'Time ran out' : 'You stopped'} at level {splits.length + 1} of {LEVEL_COUNT},
        having found {splits.length} of them.
      {/if}
    </p>
  {/if}

  <div class="hero">
    <!-- No par comparison for a hunt that was cut short. Par is the whole
         route's, so ending early subtracts time for legs nobody walked and
         reports a personal best — "under par by 18:01" for finding nothing.
         Elapsed time is the only honest number here. -->
    {#if game.abandoned}
      <p class="label">Time played</p>
      <p class="big">{formatMarquee(clock.elapsedMs)}</p>
      <p class="raw">
        {splits.length === 0
          ? 'On the board below everyone who found something.'
          : `On the board on ${splits.length} found — below anyone who finished.`}
      </p>
    {:else}
      <p class="label">{score <= 0 ? 'Under par by' : 'Over par by'}</p>
      <p class="big">{formatMarquee(Math.abs(score))}</p>
      <p class="raw">Total time {formatMarquee(clock.elapsedMs)}</p>
    {/if}
  </div>

  {#if self && !game.abandoned}
    <p class="rank">
      {#if self.rank <= 3}<Icon name="trophy" size={18} />{/if}
      {self.rank}{#if standings.rows.length} of {standings.rows.length}{/if}
    </p>
  {/if}

  <!-- The strip the player watched fill up, finished. Warm frames are the legs
       they beat par on. -->
  <div class="reel">
    <FilmStrip {splits} size="full" />
  </div>

  <ol class="splits">
    {#each splits as s}
      <li>
        <span class="n">0{s.level}</span>
        <span class="place">{name(s.locationId)}</span>
        <span class="t">{formatMarquee(s.splitMs)}{#if s.penaltyMs}<em> +{formatMarquee(s.penaltyMs)}</em>{/if}</span>
      </li>
    {/each}
  </ol>

  {#if earned.length > 0}
    <section class="ladder">
      <h2>Unlocked</h2>
      <ul>
        {#each earned as p (p.rung)}
          <li>
            <span class="r"><Icon name={rungIcon(p.rung)} size={18} /></span>
            <b>{p.name}</b>
            <em>{p.blurb}</em>
          </li>
        {/each}
      </ul>
    </section>
  {/if}

  {#if wrapped}
    <!-- The wrap: the five they walked, and only those. Showing the rest of the
         pool would name places this player was never sent to, which is both a
         spoiler for their replay and a leak of everyone else's clues. -->
    <section class="wrap">
      <h2>The wrap — the five you found</h2>
      <CampusMap route={visited} />
    </section>
  {/if}

  <div class="actions">
    <Button variant="secondary" onclick={() => nav.open('standings')}>View standings</Button>
    <Button disabled={starting} onclick={playAgain}>
      {starting ? 'Preparing…' : 'Play again'}
    </Button>
    {#if !demoAllowed}
      <p class="replay-note">
        A new route replaces this result in the standings, and it won't send you
        to the same places.
      </p>
    {/if}
    <Button variant="text" onclick={signOut}>{demoAllowed ? 'Leave practice' : 'Sign out'}</Button>
    <Button variant="text" onclick={() => void shareResult()}>
      Share result
    </Button>
  </div>
</main>

<style>
  .ladder,
  .wrap {
    padding: var(--sp-4);
    border-radius: var(--radius-card);
    background: var(--surface);
    border: var(--glass-border);
  }
  .ladder h2,
  .wrap h2 {
    margin: 0 0 var(--sp-3);
    font-size: var(--step-15);
    font-weight: 600;
    letter-spacing: 0.02em;
  }
  .ladder ul {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: var(--sp-3);
  }
  .ladder li {
    display: grid;
    grid-template-columns: 30px 1fr;
    gap: 4px var(--sp-2);
    align-items: baseline;
  }
  .ladder .r {
    grid-row: span 2;
    display: grid;
    place-items: center;
    width: 30px;
    height: 30px;
    color: var(--amber);
    border: 1px solid color-mix(in srgb, var(--amber) 45%, transparent);
    background: color-mix(in srgb, var(--amber) 12%, transparent);
    border-radius: 999px;
  }
  .ladder em {
    grid-column: 2;
    font-style: normal;
    font-size: var(--step-15);
    color: var(--text-dim);
  }

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
  .replay-note {
    margin: calc(-1 * var(--sp-2)) 0 0;
    color: var(--text-faint);
    font-size: var(--step-13);
    text-align: center;
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
  .reel {
    margin: var(--sp-5) 0 var(--sp-4);
  }
  .stopped {
    margin: 0 0 var(--sp-4);
    color: var(--text-dim);
    font-size: var(--step-15);
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
