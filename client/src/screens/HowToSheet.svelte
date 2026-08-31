<script lang="ts">
  import {nav} from '../lib/stores/nav.svelte'
  import {game} from '../lib/stores/game.svelte'
  import Sheet from '../lib/components/Sheet.svelte'
  import Button from '../lib/components/Button.svelte'
  import Icon from '../lib/components/Icon.svelte'

  const rows = [
    {icon: 'steps', title: 'Five levels, in order.', body: 'Finish one to unlock the next.'},
    {icon: 'film', title: 'The clip is the clue.', body: 'It shows a real campus spot. No map, no arrows.'},
    {icon: 'pin', title: 'Walk there with your phone.', body: "You'll know you've arrived when the scene plays."},
    {icon: 'bulb', title: 'Stuck? Take a hint.', body: 'It costs you time, and the cost is the same for everyone.'},
    {icon: 'path', title: 'Your route is yours.', body: "It won't match anyone else's."},
    {icon: 'timer', title: 'Fastest fair time wins.', body: 'Your score adjusts for how far your route was.'},
  ] as const

  function done() {
    nav.close()
    if (!game.token) nav.go('permissions')
  }
</script>

<Sheet title="How to play" height="86%">
  <div class="rows">
    {#each rows as r}
      <div class="row">
        <Icon name={r.icon} size={20} />
        <div>
          <strong>{r.title}</strong>
          <p>{r.body}</p>
        </div>
      </div>
    {/each}
  </div>
  {#snippet footer()}
    <Button onclick={done}>Got it</Button>
  {/snippet}
</Sheet>

<style>
  .rows {
    display: flex;
    flex-direction: column;
    gap: var(--sp-6);
    padding-bottom: var(--sp-4);
  }
  .row {
    display: flex;
    gap: var(--sp-3);
  }
  .row :global(svg) {
    color: var(--amber);
    flex-shrink: 0;
    margin-top: 2px;
  }
  strong {
    display: block;
    font-weight: 600;
  }
  p {
    margin: 2px 0 0;
    color: var(--text-dim);
    font-size: var(--step-15);
  }
  :global(.footer .primary) {
    width: 100%;
  }
</style>
