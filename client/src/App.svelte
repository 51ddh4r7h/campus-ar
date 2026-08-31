<script lang="ts">
  import {onMount} from 'svelte'
  import {api} from './lib/api'
  import {game} from './lib/stores/game.svelte'
  import {nav} from './lib/stores/nav.svelte'
  import {location} from './lib/stores/location.svelte'
  import {camera} from './lib/stores/camera.svelte'
  import {probe} from './lib/stores/probe.svelte'
  import {standings} from './lib/stores/standings.svelte'
  import {haptics} from './lib/haptics'
  import {playerLink, demoAllowed} from './lib/mode'

  import Splash from './screens/Splash.svelte'
  import Join from './screens/Join.svelte'
  import Welcome from './screens/Welcome.svelte'
  import Permissions from './screens/Permissions.svelte'
  import Ready from './screens/Ready.svelte'
  import Clue from './screens/Clue.svelte'
  import Search from './screens/Search.svelte'
  import Reveal from './screens/Reveal.svelte'
  import Finish from './screens/Finish.svelte'

  import HowToSheet from './screens/HowToSheet.svelte'
  import HintSheet from './screens/HintSheet.svelte'
  import StandingsSheet from './screens/StandingsSheet.svelte'
  import HereSheet from './screens/HereSheet.svelte'
  import Toaster from './lib/components/Toaster.svelte'
  import DemoBadge from './lib/components/DemoBadge.svelte'

  const screens = {splash: Splash, join: Join, welcome: Welcome, permissions: Permissions, ready: Ready, clue: Clue, search: Search, reveal: Reveal, finish: Finish}
  const Screen = $derived(screens[nav.screen])

  onMount(async () => {
    // A pre-registered player's personal link.
    if (playerLink && !game.token) {
      game.setCredentials(playerLink.token, playerLink.batchId, playerLink.name, {demo: false})
      history.replaceState(null, '', window.location.pathname)
    }

    if (game.token) {
      // Retry through a bad connection on cold start — the session is on the server.
      let ok = await game.refresh()
      for (let i = 0; i < 20 && !ok && game.token; i++) {
        await new Promise((r) => setTimeout(r, 2500))
        ok = await game.refresh()
      }
      if (!game.token) nav.go(demoAllowed ? 'welcome' : 'join')
      else if (game.complete) nav.go('finish')
      else if (game.inProgress) nav.go('clue')
      else nav.go('welcome')
    } else {
      setTimeout(() => nav.go(demoAllowed ? 'welcome' : 'join'), 1400)
    }
  })

  // GPS + camera lifecycle — run through the playing screens, stop elsewhere.
  $effect(() => {
    const playing = game.inProgress && ['clue', 'search', 'reveal'].includes(nav.screen)
    if (playing && location.mode === 'off') location.start(game.demo ? 'sim' : 'real')
    if (playing && (nav.screen === 'search' || nav.screen === 'reveal') && !camera.active) {
      void camera.start()
    }
    if (nav.screen === 'finish' || nav.screen === 'welcome') {
      location.stop()
      camera.stop()
    }
  })

  // "Am I there yet?" probe while searching. A grace period keeps the sheet
  // from popping the instant the screen opens.
  $effect(() => {
    if (nav.screen !== 'search' || !game.inProgress || !game.token) return
    const token = game.token
    let armed = false
    const arm = setTimeout(() => (armed = true), 9_000)
    const run = async () => {
      const r = await api.nearby(token, location.recent()).catch(() => null)
      if (r) probe.last = r
      if (armed && r?.atTarget && nav.sheet !== 'here') {
        haptics.arrive()
        nav.open('here')
      }
    }
    void run()
    const id = setInterval(run, 5_000)
    return () => {
      clearInterval(id)
      clearTimeout(arm)
      probe.reset()
    }
  })

  // Poll standings whenever we belong to a batch.
  $effect(() => {
    const batchId = game.batchId
    if (!batchId) return
    const poll = () => void standings.refresh(batchId, game.token ?? undefined)
    poll()
    const id = setInterval(poll, 12_000)
    return () => clearInterval(id)
  })
</script>

<Screen />

{#if nav.sheet === 'howto'}<HowToSheet />{/if}
{#if nav.sheet === 'hint'}<HintSheet />{/if}
{#if nav.sheet === 'standings'}<StandingsSheet />{/if}
{#if nav.sheet === 'here'}<HereSheet />{/if}

{#if !game.online && ['clue', 'search', 'reveal'].includes(nav.screen)}
  <div class="offline" role="status">Reconnecting…</div>
{/if}

{#if game.demo && ['ready', 'clue', 'search', 'reveal', 'finish'].includes(nav.screen)}
  <DemoBadge />
{/if}

{#if camera.lost && ['search', 'reveal'].includes(nav.screen)}
  <div class="recover" role="alertdialog" aria-label="Camera turned off">
    <p><b>Camera turned off</b></p>
    <p class="dim">Turn it back on to keep playing — your timer's still running.</p>
    <button onclick={() => void camera.retry()}>Enable camera</button>
  </div>
{/if}

<Toaster />

<style>
  .offline {
    position: fixed;
    top: calc(var(--safe-top) + var(--sp-2));
    left: 50%;
    transform: translateX(-50%);
    z-index: 70;
    padding: 6px 14px;
    border-radius: 999px;
    font-size: var(--step-13);
    color: var(--text-dim);
    background: var(--surface);
    backdrop-filter: blur(var(--blur));
    border: var(--glass-border);
  }
  .recover {
    position: fixed;
    inset: 0;
    z-index: 80;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: var(--sp-3);
    padding: var(--edge);
    text-align: center;
    background: rgba(10, 11, 13, 0.86);
    backdrop-filter: blur(8px);
  }
  .recover p {
    margin: 0;
    max-width: 30ch;
  }
  .recover .dim {
    color: var(--text-dim);
    font-size: var(--step-15);
  }
  .recover button {
    margin-top: var(--sp-3);
    height: 52px;
    padding: 0 var(--sp-8);
    border-radius: var(--radius-button);
    font-weight: 600;
    color: var(--amber-ink);
    background: var(--amber);
  }
</style>
