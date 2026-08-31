<script lang="ts">
  import {nav} from '../lib/stores/nav.svelte'
  import {isInAppBrowser} from '../lib/env'
  import Button from '../lib/components/Button.svelte'
  import Icon from '../lib/components/Icon.svelte'

  const inApp = isInAppBrowser()
</script>

<main>
  {#if inApp}
    <div class="warn" role="status">
      Open this link in <b>Safari</b> or <b>Chrome</b> — the camera won't work in this app's browser.
    </div>
  {/if}
  <div class="top">
    <h1>Campus<br />Movie&nbsp;Hunt</h1>
    <p class="tag">Five movie scenes are hidden across campus. Find where they were shot.</p>
    <ul>
      <li><Icon name="play" /> Watch a scene</li>
      <li><Icon name="eye" /> Recognise the place</li>
      <li><Icon name="pin" /> Walk there and watch it come alive</li>
    </ul>
  </div>
  <div class="actions">
    <Button onclick={() => nav.open('howto')}>How to play</Button>
    <Button variant="text" onclick={() => nav.go('permissions')}>I know the rules — skip ahead</Button>
  </div>
</main>

<style>
  main {
    min-height: 100dvh;
    display: flex;
    flex-direction: column;
    justify-content: center;
    gap: clamp(var(--sp-8), 12vh, 96px);
    padding: calc(var(--safe-top) + var(--sp-8)) var(--edge) calc(var(--safe-bottom) + var(--sp-6));
  }
  .warn {
    position: fixed;
    top: calc(var(--safe-top) + var(--sp-2));
    left: var(--edge);
    right: var(--edge);
    padding: var(--sp-3);
    border-radius: 12px;
    font-size: var(--step-13);
    color: var(--amber-ink);
    background: var(--amber);
    z-index: 5;
  }
  h1 {
    font-family: var(--font-display);
    font-weight: 400;
    font-size: clamp(2.6rem, 11vw, 3.4rem);
    line-height: 0.98;
    margin: 0 0 var(--sp-4);
  }
  .tag {
    color: var(--text-dim);
    margin: 0 0 var(--sp-6);
    max-width: 30ch;
  }
  ul {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: var(--sp-4);
  }
  li {
    display: flex;
    align-items: center;
    gap: var(--sp-3);
    color: var(--text);
  }
  li :global(svg) {
    color: var(--amber);
    flex-shrink: 0;
  }
  .actions {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--sp-2);
  }
  .actions :global(.primary) {
    width: 100%;
  }
</style>
