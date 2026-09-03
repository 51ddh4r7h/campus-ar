<script lang="ts">
  import {nav} from '../lib/stores/nav.svelte'
  import {HOW_TO} from '../lib/how-to'
  import Sheet from '../lib/components/Sheet.svelte'
  import Button from '../lib/components/Button.svelte'
  import Icon from '../lib/components/Icon.svelte'

  /**
   * Purely informational. This used to advance the player to the permissions
   * screen when they had no token — which silently became a dead end once
   * players could sign in, because then they always had one. The screen behind
   * the sheet owns the "what next"; the sheet only closes.
   */
  const done = () => nav.close()
</script>

<Sheet title="How to play" height="86%">
  <div class="rows">
    {#each HOW_TO as r (r.title)}
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
