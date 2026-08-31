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

  import Splash from './screens/Splash.svelte'
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

  const screens = {splash: Splash, welcome: Welcome, permissions: Permissions, ready: Ready, clue: Clue, search: Search, reveal: Reveal, finish: Finish}
  const Screen = $derived(screens[nav.screen])

  onMount(async () => {
    // A pre-registered player's link: ?t=<token>&b=<batchId>
    const url = new URL(window.location.href)
    const t = url.searchParams.get('t')
    const b = url.searchParams.get('b')
    if (t && b) {
      game.setCredentials(t, b, url.searchParams.get('n') ?? 'Player', {demo: false})
      history.replaceState(null, '', url.pathname)
    }

    if (game.token) {
      await game.refresh()
      if (game.complete) nav.go('finish')
      else if (game.inProgress) nav.go('clue')
      else nav.go('ready')
    } else {
      setTimeout(() => nav.go('welcome'), 1400)
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

{#if !game.online}
  <div class="offline" role="status">Reconnecting…</div>
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
</style>
