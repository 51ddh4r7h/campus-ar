<script lang="ts">
  /**
   * The beat between signing in and playing.
   *
   * This is where the old flow fell over: signup dropped the player back on the
   * same marketing screen they had just come from, with no acknowledgement that
   * an account now existed, and the only forward action was a sheet whose
   * button did nothing. So: greet them by name, state the rules in full — not
   * behind a tap — and give one obvious way on.
   */
  import {nav} from '../lib/stores/nav.svelte'
  import {game} from '../lib/stores/game.svelte'
  import {HOW_TO} from '../lib/how-to'
  import Button from '../lib/components/Button.svelte'
  import Icon from '../lib/components/Icon.svelte'

  const first = $derived(game.playerName?.trim().split(/\s+/)[0] ?? '')
</script>

<main>
  <header>
    <!-- A practice run reaches here before its throwaway session exists, so the
         token is what says whether this is a real account, not `demo`. -->
    <span class="eyebrow">{game.token ? "You're in" : 'Practice run'}</span>
    <h1>{first ? `Ready, ${first}?` : 'Ready?'}</h1>
    <p class="sub">Read this once — it's the whole game.</p>
  </header>

  <ol class="rules">
    {#each HOW_TO as r, i (r.title)}
      <li style="--i: {i}">
        <span class="ico"><Icon name={r.icon} size={19} /></span>
        <div>
          <strong>{r.title}</strong>
          <p>{r.body}</p>
        </div>
      </li>
    {/each}
  </ol>

  <div class="actions">
    <Button onclick={() => nav.go('permissions')}>Continue</Button>
    <p class="note">Next: location and camera access. Both are needed to play.</p>
  </div>
</main>

<style>
  main {
    min-height: 100dvh;
    display: flex;
    flex-direction: column;
    gap: var(--sp-6);
    padding: calc(var(--safe-top) + var(--sp-8)) var(--edge) calc(var(--safe-bottom) + var(--sp-6));
  }
  header {
    animation: rise 0.6s var(--ease-spring) both;
  }
  .eyebrow {
    display: block;
    font-family: var(--font-mono);
    font-size: var(--step-13);
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: var(--amber);
    margin-bottom: var(--sp-2);
  }
  h1 {
    font-family: var(--font-display);
    font-weight: 400;
    font-size: clamp(2.1rem, 9vw, 2.8rem);
    line-height: 1;
    margin: 0 0 var(--sp-2);
  }
  .sub {
    margin: 0;
    color: var(--text-dim);
    font-size: var(--step-15);
  }

  .rules {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: var(--sp-4);
  }
  .rules li {
    display: flex;
    gap: var(--sp-3);
    animation: rise 0.6s var(--ease-spring) both;
    animation-delay: calc(0.08s + var(--i) * 0.055s);
  }
  .ico {
    flex: none;
    display: grid;
    place-items: center;
    width: 34px;
    height: 34px;
    border-radius: 999px;
    color: var(--amber);
    border: 1px solid var(--hairline);
    background: var(--surface);
  }
  strong {
    display: block;
    font-weight: 600;
    font-size: var(--step-15);
  }
  .rules p {
    margin: 2px 0 0;
    color: var(--text-dim);
    font-size: var(--step-15);
    line-height: 1.4;
  }

  .actions {
    margin-top: auto;
    padding-top: var(--sp-4);
    display: flex;
    flex-direction: column;
    gap: var(--sp-3);
    animation: rise 0.6s var(--ease-spring) 0.42s both;
  }
  .actions :global(.primary) {
    width: 100%;
  }
  .note {
    margin: 0;
    text-align: center;
    color: var(--text-faint);
    font-size: var(--step-13);
  }

  @keyframes rise {
    from {
      opacity: 0;
      transform: translateY(12px);
    }
  }
</style>
