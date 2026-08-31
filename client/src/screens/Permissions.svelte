<script lang="ts">
  import {nav} from '../lib/stores/nav.svelte'
  import {game} from '../lib/stores/game.svelte'
  import {location} from '../lib/stores/location.svelte'
  import {startDemo} from '../lib/demo'
  import {toasts} from '../lib/stores/toast.svelte'
  import Button from '../lib/components/Button.svelte'
  import Icon from '../lib/components/Icon.svelte'

  let phase = $state<'ask' | 'waiting' | 'denied' | 'unavailable'>('ask')

  async function enable() {
    phase = 'waiting'
    // One prompt via getCurrentPosition; the watch starts once we route on.
    navigator.geolocation.getCurrentPosition(
      () => void proceed(),
      (err) => {
        phase = err.code === err.PERMISSION_DENIED ? 'denied' : 'unavailable'
      },
      {enableHighAccuracy: true, timeout: 15_000},
    )
  }

  async function proceed() {
    try {
      if (!game.token) await startDemo()
      nav.go('ready')
    } catch {
      toasts.show("Couldn't start a session — try again", 'alert')
      phase = 'ask'
    }
  }

  async function demoInstead() {
    game.demo = true
    location.permission = 'denied'
    await proceed()
  }
</script>

<main>
  <div class="icon" class:bad={phase === 'denied' || phase === 'unavailable'}>
    <Icon name="pin" size={30} />
  </div>
  <div class="copy">
    <span class="eyebrow">Campus Movie Hunt</span>
    {#if phase === 'denied'}
      <h1>Location is off</h1>
      <p>Turn it back on in Settings, or play the demo instead.</p>
    {:else if phase === 'unavailable'}
      <h1>No location signal</h1>
      <p>We can't get a fix here. You can still play the demo.</p>
    {:else}
      <h1>Turn on location</h1>
      <p>We use it only to check when you've reached a scene. We never show your position to anyone.</p>
    {/if}
  </div>
  <div class="actions">
    {#if phase === 'denied' || phase === 'unavailable'}
      <Button onclick={demoInstead}>Play the demo</Button>
    {:else}
      <Button disabled={phase === 'waiting'} onclick={enable}>
        {phase === 'waiting' ? 'Waiting…' : 'Enable location'}
      </Button>
      <Button variant="text" onclick={demoInstead}>Can't enable this?</Button>
    {/if}
  </div>
</main>

<style>
  main {
    min-height: 100dvh;
    display: grid;
    grid-template-rows: 1fr auto auto;
    align-items: center;
    padding: calc(var(--safe-top) + var(--sp-8)) var(--edge) calc(var(--safe-bottom) + var(--sp-6));
    gap: var(--sp-8);
    text-align: center;
  }
  .icon {
    justify-self: center;
    display: grid;
    place-items: center;
    width: 84px;
    height: 84px;
    border-radius: 999px;
    border: 1px solid var(--hairline);
    color: var(--amber);
  }
  .icon.bad {
    color: var(--alert);
    border-color: color-mix(in srgb, var(--alert) 40%, transparent);
  }
  .eyebrow {
    display: block;
    font-size: var(--step-13);
    letter-spacing: 0.09em;
    text-transform: uppercase;
    color: var(--text-dim);
    margin-bottom: var(--sp-2);
  }
  h1 {
    font-size: var(--step-28);
    font-weight: 600;
    margin: 0 0 var(--sp-3);
  }
  p {
    color: var(--text-dim);
    margin: 0 auto;
    max-width: 34ch;
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
