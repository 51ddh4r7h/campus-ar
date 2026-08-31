<script lang="ts">
  import {nav} from '../lib/stores/nav.svelte'
  import {game} from '../lib/stores/game.svelte'
  import {location} from '../lib/stores/location.svelte'
  import {camera} from '../lib/stores/camera.svelte'
  import {ar} from '../lib/stores/ar.svelte'
  import {demoAllowed} from '../lib/mode'
  import {startDemo} from '../lib/demo'
  import {toasts} from '../lib/stores/toast.svelte'
  import Button from '../lib/components/Button.svelte'
  import Icon from '../lib/components/Icon.svelte'

  let step = $state<'location' | 'camera'>('location')
  let phase = $state<'ask' | 'waiting' | 'denied' | 'unavailable'>('ask')

  function askLocation() {
    phase = 'waiting'
    navigator.geolocation.getCurrentPosition(
      () => {
        phase = 'ask'
        step = 'camera'
      },
      (err) => {
        phase = err.code === err.PERMISSION_DENIED ? 'denied' : 'unavailable'
      },
      {enableHighAccuracy: true, timeout: 15_000},
    )
  }

  async function askCamera() {
    phase = 'waiting'
    // Same gesture: camera stream + iOS motion permission for the AR screen.
    await Promise.all([camera.start(), ar.requestPermission()])
    // Denial of either is fine — the game still works on GPS. Move on.
    await proceed()
  }

  async function proceed() {
    if (!game.token && !demoAllowed) {
      nav.go('join')
      return
    }
    try {
      if (!game.token) await startDemo()
      nav.go('ready')
    } catch {
      toasts.show("Couldn't start a session — try again", 'alert')
      phase = 'ask'
    }
  }

  function demoInstead() {
    game.demo = true
    location.permission = 'denied'
    step = 'camera'
    phase = 'ask'
  }

  const bad = $derived(phase === 'denied' || phase === 'unavailable')
</script>

<main>
  <div class="body">
    <div class="icon" class:bad>
      <Icon name={step === 'camera' ? 'camera' : 'pin'} size={28} />
    </div>
    <span class="eyebrow">Campus Movie Hunt</span>

    {#if step === 'location'}
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
    {:else}
      <h1>Turn on the camera</h1>
      <p>The hunt happens through your camera. Point it at campus and the scenes appear where they were filmed.</p>
    {/if}
  </div>

  <div class="actions">
    {#if step === 'location' && bad}
      <Button onclick={demoInstead}>Play the demo</Button>
    {:else if step === 'location'}
      <Button disabled={phase === 'waiting'} onclick={askLocation}>
        {phase === 'waiting' ? 'Waiting…' : 'Enable location'}
      </Button>
      <Button variant="text" onclick={demoInstead}>Can't enable this?</Button>
    {:else}
      <Button disabled={phase === 'waiting'} onclick={askCamera}>
        {phase === 'waiting' ? 'Waiting…' : 'Enable camera'}
      </Button>
      <Button variant="text" onclick={proceed}>Skip for now</Button>
    {/if}
  </div>
</main>

<style>
  main {
    min-height: 100dvh;
    display: flex;
    flex-direction: column;
    padding: calc(var(--safe-top) + var(--sp-8)) var(--edge) calc(var(--safe-bottom) + var(--sp-6));
    text-align: center;
  }
  .body {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: var(--sp-2);
  }
  .icon {
    display: grid;
    place-items: center;
    width: 84px;
    height: 84px;
    border-radius: 999px;
    border: 1px solid var(--hairline);
    color: var(--amber);
    margin-bottom: var(--sp-6);
  }
  .icon.bad {
    color: var(--alert);
    border-color: color-mix(in srgb, var(--alert) 40%, transparent);
  }
  .eyebrow {
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
    margin: 0;
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
