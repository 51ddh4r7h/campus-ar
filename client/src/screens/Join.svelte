<script lang="ts">
  import {demoAllowed} from '../lib/mode'
  import {nav} from '../lib/stores/nav.svelte'
  import Button from '../lib/components/Button.svelte'
  import Icon from '../lib/components/Icon.svelte'
</script>

<main>
  <div class="body">
    <div class="icon"><Icon name="pin" size={28} /></div>
    <h1>Campus Movie Hunt</h1>
    <p>
      Your entry link is personal — open the one you were given at registration.
      It looks like <code>…/?t=…</code>.
    </p>
  </div>
  {#if demoAllowed}
    <div class="actions">
      <Button onclick={() => nav.go('welcome')}>Try a practice run</Button>
    </div>
  {/if}
</main>

<style>
  main {
    min-height: 100dvh;
    display: flex;
    flex-direction: column;
    text-align: center;
    padding: calc(var(--safe-top) + var(--sp-8)) var(--edge) calc(var(--safe-bottom) + var(--sp-6));
  }
  .body {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: var(--sp-3);
  }
  .icon {
    display: grid;
    place-items: center;
    width: 84px;
    height: 84px;
    border-radius: 999px;
    border: 1px solid var(--hairline);
    color: var(--amber);
    margin-bottom: var(--sp-4);
  }
  h1 {
    font-family: var(--font-display);
    font-weight: 400;
    font-size: var(--step-28);
    margin: 0 0 var(--sp-2);
  }
  p {
    color: var(--text-dim);
    max-width: 34ch;
    margin: 0;
  }
  code {
    font-family: var(--font-mono);
    color: var(--text);
  }
  .actions :global(.primary) {
    width: 100%;
  }
</style>
