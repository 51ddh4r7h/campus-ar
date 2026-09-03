<script lang="ts">
  import {onMount} from 'svelte'
  import {api} from './lib/api'
  import {game} from './lib/stores/game.svelte'
  import {nav} from './lib/stores/nav.svelte'
  import type {Screen as ScreenName} from './lib/stores/nav.svelte'
  import {location} from './lib/stores/location.svelte'
  import {camera} from './lib/stores/camera.svelte'
  import {probe} from './lib/stores/probe.svelte'
  import {standings} from './lib/stores/standings.svelte'
  import {haptics} from './lib/haptics'
  import {playerLink, adminRequested} from './lib/mode'
  import {POLLING} from '@cmh/shared'

  import Splash from './screens/Splash.svelte'
  import Hero from './screens/Hero.svelte'
  import Signin from './screens/Signin.svelte'
  import Briefing from './screens/Briefing.svelte'
  import Permissions from './screens/Permissions.svelte'
  import Ready from './screens/Ready.svelte'
  import Clue from './screens/Clue.svelte'
  import Search from './screens/Search.svelte'
  import Reveal from './screens/Reveal.svelte'
  import Finish from './screens/Finish.svelte'
  import Admin from './screens/Admin.svelte'

  import HowToSheet from './screens/HowToSheet.svelte'
  import HintSheet from './screens/HintSheet.svelte'
  import StandingsSheet from './screens/StandingsSheet.svelte'
  import Toaster from './lib/components/Toaster.svelte'
  import DemoBadge from './lib/components/DemoBadge.svelte'

  const screens = {
    splash: Splash,
    hero: Hero,
    signin: Signin,
    briefing: Briefing,
    permissions: Permissions,
    ready: Ready,
    clue: Clue,
    search: Search,
    reveal: Reveal,
    finish: Finish,
  }
  const Screen = $derived(screens[nav.screen])

  /** Entry screens cross-fade; in-game ones cut, so the camera never blinks. */
  const SOFT: readonly ScreenName[] = ['hero', 'signin', 'briefing', 'permissions', 'ready']

  /**
   * Everyone without a live session lands on the hero. It knows what to offer:
   * a way in for a cohort link, a practice run where that is allowed, and an
   * explanation otherwise. One screen instead of three.
   */
  const entryScreen = (): ScreenName => 'hero'

  /** The session lives on the server — keep asking through a bad cold start. */
  async function restoreSession(): Promise<void> {
    let ok = await game.refresh()
    for (let i = 0; i < 20 && !ok && game.token; i++) {
      await new Promise((r) => setTimeout(r, 2500))
      ok = await game.refresh()
    }
  }

  /** Drop the player back exactly where the server says they are. */
  function routeToSession(): void {
    if (!game.token) nav.go(entryScreen())
    else if (game.complete) nav.go('finish')
    else if (game.inProgress) nav.go('clue')
    // Signed in but not started — the briefing, which owns the way forward.
    else nav.go('briefing')
  }

  onMount(async () => {
    // The organiser console is a separate surface — no session, no sensors.
    if (adminRequested) return

    // A pre-registered player's personal link.
    if (playerLink && !game.token) {
      game.setCredentials(playerLink.token, playerLink.batchId, playerLink.name, {demo: false})
      history.replaceState(null, '', window.location.pathname)
    }

    // Nothing to restore — show the hero straight away. The splash exists to
    // cover the session fetch below, not to make a new player wait.
    if (!game.token) {
      nav.go(entryScreen())
      return
    }
    await restoreSession()
    routeToSession()
  })

  const PLAYING: readonly ScreenName[] = ['clue', 'search', 'reveal']
  /** Screens shot through the live camera. */
  const THROUGH_LENS: readonly ScreenName[] = ['search', 'reveal']
  /** Screens where the hunt isn't running, so the sensors should be off. */
  const IDLE: readonly ScreenName[] = ['finish', 'briefing']

  const playing = $derived(game.inProgress && PLAYING.includes(nav.screen))
  const wantsCamera = $derived(playing && THROUGH_LENS.includes(nav.screen))

  // GPS + camera lifecycle — run through the playing screens, stop elsewhere.
  $effect(() => {
    if (playing && location.mode === 'off') location.start(game.demo ? 'sim' : 'real')
    if (wantsCamera && !camera.active) void camera.start()
    if (IDLE.includes(nav.screen)) {
      location.stop()
      camera.stop()
    }
  })

  // "Am I there yet?" — runs across the search AND the arrival, because the
  // dwell reported here is what builds the screen on the reveal. A grace period
  // stops it firing the instant the search screen opens. Faster while locking:
  // that poll is the progress bar.
  $effect(() => {
    const watching = nav.screen === 'search' || nav.screen === 'reveal'
    if (!watching || !game.inProgress || !game.token) return
    const token = game.token
    let armed = nav.screen === 'reveal'
    const arm = setTimeout(() => (armed = true), 9_000)
    const run = async () => {
      const r = await api.nearby(token, location.recent()).catch(() => null)
      if (r) probe.last = r
      if (armed && r?.atTarget && nav.screen === 'search') {
        haptics.arrive()
        nav.go('reveal')
      }
    }
    void run()
    const id = setInterval(run, nav.screen === 'reveal' ? POLLING.nearbyRevealMs : POLLING.nearbyMs)
    return () => {
      clearInterval(id)
      clearTimeout(arm)
    }
  })

  /**
   * Standings, only while someone is looking.
   *
   * This used to poll every 12s for the whole game. The board is a sheet that
   * spends nearly all its time closed, and the request is the most expensive
   * one we make — it reads every player and every session in the batch. With a
   * cohort of 200 that was a few thousand rows a second, permanently, to render
   * a screen nobody had open. Now it runs while the sheet is up, and once on
   * the wrap where the final rank is actually shown.
   */
  $effect(() => {
    const batchId = game.batchId
    if (!batchId) return
    const watching = nav.sheet === 'standings' || nav.screen === 'finish'
    if (!watching) return
    const poll = () => void standings.refresh(batchId, game.token ?? undefined)
    poll()
    const id = setInterval(poll, POLLING.standingsMs)
    return () => clearInterval(id)
  })
</script>

{#if adminRequested}
  <Admin />
{:else}
  <!-- Keyed so a screen change is a real swap Svelte can transition. Only the
       pre-game screens fade; cross-fading a live camera view would strobe. -->
  {#key nav.screen}
    {#if SOFT.includes(nav.screen)}
      <div class="screen-fade"><Screen /></div>
    {:else}
      <Screen />
    {/if}
  {/key}
{/if}

{#if nav.sheet === 'howto'}<HowToSheet />{/if}
{#if nav.sheet === 'hint'}<HintSheet />{/if}
{#if nav.sheet === 'standings'}<StandingsSheet />{/if}

{#if !game.online && PLAYING.includes(nav.screen)}
  <div class="offline" role="status">Reconnecting…</div>
{/if}

{#if game.demo && ['ready', 'clue', 'search', 'reveal', 'finish'].includes(nav.screen)}
  <DemoBadge />
{/if}

{#if camera.lost && THROUGH_LENS.includes(nav.screen)}
  <div class="recover" role="alertdialog" aria-label="Camera turned off">
    <p><b>Camera turned off</b></p>
    <p class="dim">Turn it back on to keep playing — your timer's still running.</p>
    <button onclick={() => void camera.retry()}>Enable camera</button>
  </div>
{/if}

<Toaster />

<style>
  .screen-fade {
    animation: screen-in var(--dur-standard) var(--ease-spring) both;
  }
  @keyframes screen-in {
    from {
      opacity: 0;
      transform: translateY(8px);
    }
  }
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
