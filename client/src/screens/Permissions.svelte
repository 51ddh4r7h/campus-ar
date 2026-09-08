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
  import StepDots from '../lib/components/StepDots.svelte'

  /** Lazy, like the hero's beam: three.js is a chunk, not a line. */
  const scan = import('../lib/components/bits/GridScan.svelte')

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
    await Promise.all([camera.start(), ar.ensure()])
    // Denial of either is fine — the game still works on GPS. Move on.
    await proceed()
  }

  async function skipCamera() {
    // Motion permission is independent of the camera. Grab it on this gesture
    // anyway (instant on Android; the iOS prompt on iOS) so the AR screen still
    // works for players who skip the camera.
    await ar.ensure()
    await proceed()
  }

  async function proceed() {
    // No session and no way to make one — back to the hero, which explains why.
    if (!game.token && !demoAllowed) {
      nav.go('hero')
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

  /**
   * Practice is only for people without a real session.
   *
   * This used to be offered to everyone, on a text button sitting under the
   * location prompt, and it set `game.demo` regardless of who was asking. For a
   * signed-in player that swapped their real hunt onto the GPS simulator, which
   * walks between stops on a timer: the game would play itself through all five
   * levels while they stood still, and record the score. A player with a slow
   * fix, one tap from the prompt, could do that by accident — which is exactly
   * how a field test today ended up completing two levels from a classroom.
   *
   * A real session that cannot get a location is a problem to fix, not to
   * simulate around.
   */
  const canPractise = $derived(demoAllowed && !game.token)

  function demoInstead() {
    if (!canPractise) return
    game.demo = true
    location.permission = 'denied'
    step = 'camera'
    phase = 'ask'
  }

  const bad = $derived(phase === 'denied' || phase === 'unavailable')
</script>

<!-- A grid sweeping the ground while we ask for the sensors that will read it.
     Tilts with the phone via the component's own gyroscope handler. -->
<div class="scan" aria-hidden="true">
  {#await scan then GridScan}
    <GridScan.default
      linesColor="#2a2f37"
      scanColor="#e8a54c"
      enableGyro={true}
    />
  {/await}
</div>

<main>
  <div class="progress">
    <StepDots
      current={step === 'location' ? 1 : 2}
      total={2}
      labels={['Location', 'Camera']}
    />
  </div>
  <div class="body">
    <div class="icon" class:bad>
      <Icon name={step === 'camera' ? 'camera' : 'pin'} size={28} />
    </div>
    <span class="eyebrow">Campus Movie Hunt</span>

    {#if step === 'location'}
      {#if phase === 'denied'}
        <h1>Location is off</h1>
        <p>
          {canPractise
            ? 'Turn it back on in Settings, or play the demo instead.'
            : 'Turn it back on in Settings to carry on.'}
        </p>
      {:else if phase === 'unavailable'}
        <h1>No location signal</h1>
        <p>
          {canPractise
            ? "We can't get a fix here. You can still play the demo."
            : "We can't get a fix here. Step outside and try again."}
        </p>
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
    {#if step === 'location' && bad && canPractise}
      <Button onclick={demoInstead}>Play the demo</Button>
    {:else if step === 'location' && bad}
      <!-- No simulated way past this for a real hunt: the walk is the game. -->
      <Button disabled={phase === 'waiting'} onclick={askLocation}>Try again</Button>
      <p class="help">
        Location is required to play. Turn it on for this site in your browser
        settings, then tap Try again. If it still won't work, find an organiser.
      </p>
    {:else if step === 'location'}
      <Button disabled={phase === 'waiting'} onclick={askLocation}>
        {phase === 'waiting' ? 'Waiting…' : 'Enable location'}
      </Button>
      {#if canPractise}
        <Button variant="text" onclick={demoInstead}>Can't enable this?</Button>
      {/if}
    {:else}
      <Button disabled={phase === 'waiting'} onclick={askCamera}>
        {phase === 'waiting' ? 'Waiting…' : 'Enable camera'}
      </Button>
      <Button variant="text" onclick={skipCamera}>Skip for now</Button>
    {/if}
  </div>
</main>

<style>
  .scan {
    position: fixed;
    inset: 0;
    z-index: 0;
    pointer-events: none;
    background: var(--bg);
    /* Well under the copy: this is a texture, not a picture. */
    opacity: 0.5;
    mask-image: linear-gradient(to bottom, #000 0%, transparent 62%);
  }
  main {
    position: relative;
    z-index: 1;
  }
  .progress {
    padding-top: var(--sp-2);
  }
  .help {
    margin: var(--sp-2) 0 0;
    color: var(--text-dim);
    font-size: var(--step-13);
    text-align: center;
    max-width: 34ch;
  }
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
    /* The one screen of nine whose heading was still set in the interface
       face. Weight 400 because only that cut of the display face is loaded,
       and 600 would ask the browser to fake a bold. */
    font-family: var(--font-display);
    font-size: var(--step-28);
    font-weight: 400;
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
