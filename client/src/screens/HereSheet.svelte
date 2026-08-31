<script lang="ts">
  import {onMount} from 'svelte'
  import type {NearbyResult, ValidationFailure} from '@cmh/shared'
  import {nav} from '../lib/stores/nav.svelte'
  import {game} from '../lib/stores/game.svelte'
  import {location} from '../lib/stores/location.svelte'
  import {toasts} from '../lib/stores/toast.svelte'
  import Sheet from '../lib/components/Sheet.svelte'
  import Button from '../lib/components/Button.svelte'
  import Icon from '../lib/components/Icon.svelte'
  import {api} from '../lib/api'

  let probe = $state<NearbyResult | null>(null)
  let revealing = $state(false)

  function failureMessage(f: ValidationFailure | null): string {
    switch (f) {
      case 'dwell':
        return 'Hold still a moment longer'
      case 'signal':
        return 'Move to more open ground for a clearer signal'
      case 'too_fast':
        return 'Take a moment — you got here very quickly'
      case 'wrong_location':
        return "This isn't your scene. Keep looking."
      case 'level_locked':
        return 'Finish the earlier scenes first'
      default:
        return 'Not yet'
    }
  }

  const pct = $derived(probe ? Math.min(1, probe.dwellMs / probe.dwellNeededMs) : 0)
  const ready = $derived(!!probe?.atTarget && pct >= 1)

  async function tick() {
    if (!game.token) return
    probe = await api.nearby(game.token, location.recent()).catch(() => probe)
    // Left the radius — drop back to the search view.
    if (probe && !probe.atTarget && probe.failure === 'wrong_location') nav.close()
  }

  async function reveal() {
    if (!game.token) return
    revealing = true
    try {
      const res = await game.arrive(location.recent())
      if (res.ok) {
        nav.go('reveal')
      } else {
        revealing = false
        toasts.show(failureMessage(res.failure), 'alert')
        if (res.failure === 'wrong_location' || res.failure === 'level_locked') nav.close()
      }
    } catch {
      revealing = false
      toasts.show('Connection problem — try again', 'alert')
    }
  }

  onMount(() => {
    void tick()
    const id = setInterval(tick, 2500)
    return () => clearInterval(id)
  })
</script>

<Sheet height="54%" dismissable={!revealing}>
  <div class="here">
    <div class="check" class:on={ready}><Icon name="check" size={22} /></div>
    <h2>This looks like the place.</h2>
    <p>{ready ? 'The scene is ready.' : 'Hold still for a moment while we lock the scene.'}</p>
    <div class="ring" style="--p: {pct}"></div>
    {#if !ready}<span class="ring-cap">Getting a steady signal…</span>{/if}
    <Button disabled={!ready || revealing} onclick={reveal}>
      {revealing ? 'Revealing…' : 'Reveal the scene'}
    </Button>
  </div>
</Sheet>

<style>
  .here {
    display: flex;
    flex-direction: column;
    align-items: center;
    text-align: center;
    gap: var(--sp-3);
    min-height: 100%;
    padding-bottom: var(--sp-4);
  }
  .check {
    display: grid;
    place-items: center;
    width: 48px;
    height: 48px;
    border-radius: 999px;
    border: 2px solid var(--text-dim);
    color: var(--text-dim);
    transition:
      color var(--dur-standard),
      border-color var(--dur-standard);
  }
  .check.on {
    color: var(--success);
    border-color: var(--success);
  }
  h2 {
    font-family: var(--font-display);
    font-weight: 400;
    font-size: var(--step-28);
    margin: var(--sp-2) 0 0;
  }
  p {
    color: var(--text-dim);
    margin: 0;
    max-width: 30ch;
  }
  .ring {
    width: 68px;
    height: 68px;
    border-radius: 999px;
    background: conic-gradient(var(--amber) calc(var(--p) * 360deg), var(--hairline) 0);
    -webkit-mask: radial-gradient(circle 25px at 50% 50%, transparent 98%, #000 100%);
    mask: radial-gradient(circle 25px at 50% 50%, transparent 98%, #000 100%);
    margin-top: var(--sp-3);
  }
  .ring-cap {
    font-family: var(--font-mono);
    font-size: var(--step-13);
    color: var(--text-faint);
  }
  :global(.here .primary) {
    width: 100%;
    margin-top: auto;
  }
</style>
