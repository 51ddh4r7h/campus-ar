<script lang="ts">
  /**
   * Arrival. No modal, no button: the moment you're inside the geofence the
   * screen starts constructing itself in front of you, and the anti-cheat dwell
   * is what builds it. When the dwell completes the server validates, the sound
   * comes up, and the scene plays where it was actually shot.
   */
  import type {ValidationFailure, ValidationResult} from '@cmh/shared'
  import {formatMarquee} from '@cmh/shared'
  import {nav} from '../lib/stores/nav.svelte'
  import {game} from '../lib/stores/game.svelte'
  import {location} from '../lib/stores/location.svelte'
  import {probe} from '../lib/stores/probe.svelte'
  import {toasts} from '../lib/stores/toast.svelte'
  import {buildPulse, haptics} from '../lib/haptics'
  import CameraFeed from '../lib/components/CameraFeed.svelte'
  import ArScreen from '../lib/components/ArScreen.svelte'
  import Button from '../lib/components/Button.svelte'
  import Icon from '../lib/components/Icon.svelte'
  import {ApiError} from '../lib/api'
  import {camera} from '../lib/stores/camera.svelte'
  import {composeShot, offerShot, type Shot} from '../lib/ar/photo'

  let screen = $state<ReturnType<typeof ArScreen> | null>(null)
  let usedAr = $state(false)
  let played = $state(false)
  let validating = $state(false)
  let retrying = $state(false)
  let shooting = $state(false)
  let shotUrl = $state<string | null>(null)

  const r = $derived(played ? game.lastReveal : null)
  const p = $derived(probe.last)

  // The dwell drives the assembly. Keep a floor so the frame is visible the
  // instant you arrive, and hold at 0.97 until the server actually says yes.
  const build = $derived(
    played ? 1 : Math.min(0.97, 0.06 + 0.91 * Math.min(1, (p?.dwellMs ?? 0) / (p?.dwellNeededMs ?? 1))),
  )

  const holdUp = $derived(
    p?.failure === 'signal'
      ? 'Move to more open ground for a clearer signal'
      : p?.failure === 'too_fast'
        ? 'Take a moment — you got here very quickly'
        : null,
  )

  const FAILURE_MESSAGE = {
    dwell: 'Hold still a moment longer',
    signal: 'Move to more open ground for a clearer signal',
    too_fast: 'Take a moment — you got here very quickly',
    wrong_location: "This isn't your scene. Keep looking.",
    level_locked: 'Finish the earlier scenes first',
    not_in_progress: 'This hunt is over',
  } satisfies Record<ValidationFailure, string>

  /** Failures that mean you're not where you think — back to searching. */
  const sendsYouBack = (f: ValidationFailure | null): boolean =>
    f === 'wrong_location' || f === 'level_locked'

  /** A wobbly signal is worth another go; anything else is final. */
  const isTransient = (err: ApiError): boolean => err.code === 'offline' || err.code === 'server'

  let cancelled = false
  $effect(() => () => (cancelled = true))

  function abandon(message: string): void {
    validating = false
    retrying = false
    toasts.show(message, 'alert')
  }

  /** Act on a verdict the server actually returned. */
  function settle(res: ValidationResult): void {
    retrying = false
    if (res.ok) {
      played = true
      haptics.revealLock()
      screen?.playScene()
      return
    }
    validating = false
    if (sendsYouBack(res.failure)) {
      toasts.show(res.failure ? FAILURE_MESSAGE[res.failure] : 'Not yet', 'alert')
      nav.go('search')
    }
  }

  /** One claim at a time, only while we hold a session and haven't locked yet. */
  const canClaim = (): boolean => game.token !== null && !validating && !played

  async function claim() {
    if (!canClaim()) return
    validating = true
    // The player is standing on the spot — keep trying through a flaky signal.
    for (let attempt = 0; attempt < 20 && !cancelled; attempt++) {
      try {
        settle(await game.arrive(location.recent()))
        return
      } catch (err) {
        if (err instanceof ApiError && isTransient(err)) {
          retrying = true
          await new Promise((res) => setTimeout(res, 3500))
          continue
        }
        abandon('Something went wrong — hold tight')
        return
      }
    }
  }

  // The hold has a heartbeat: it quickens as the picture fills in, and stops
  // the moment the scene is won.
  $effect(() => {
    if (played) buildPulse.stop()
    else buildPulse.set(build)
  })
  $effect(() => () => buildPulse.stop())

  // Dwell satisfied (the server reports no outstanding failure) — claim it.
  $effect(() => {
    if (!played && p?.atTarget && p.failure === null) void claim()
  })

  // Walked back out of the radius before it locked.
  $effect(() => {
    if (!played && p && !p.atTarget && p.failure === 'wrong_location') nav.go('search')
  })

  /** What the saved frame is captioned with. */
  const shotCaption = () => ({
    title: r?.movie.title ?? 'Campus Movie Hunt',
    place: r?.locationName ?? '',
  })

  /** Hand the frame over by whichever route this device allows. */
  async function deliver(shot: Shot): Promise<void> {
    const how = await offerShot(shot, `campus-movie-hunt-${r?.level ?? 0}.jpg`)
    if (how === 'shown') shotUrl = shot.dataUrl
    else if (how === 'saved') toasts.show('Saved to your downloads', 'success')
  }

  /** Capture the player standing in the place, with the scene behind them. */
  async function takePhoto(): Promise<void> {
    if (shooting) return
    shooting = true
    haptics.tick()
    try {
      const shot = await composeShot(camera.videoEl, screen?.capture() ?? null, shotCaption())
      if (shot) await deliver(shot)
      else toasts.show("Couldn't capture that one", 'alert')
    } finally {
      shooting = false
    }
  }

  function next() {
    haptics.levelDone()
    nav.go(r?.huntComplete ? 'finish' : 'clue')
  }
</script>

<CameraFeed />

<ArScreen
  bind:this={screen}
  clipUrl={game.clue?.clipUrl}
  posterUrl={game.clue?.posterUrl}
  stillUrl={game.clue?.sceneRefImage}
  title={played ? r?.movie.title : undefined}
  note={played ? `Filmed at ${r?.locationName ?? 'this spot'}` : undefined}
  scene={played && r ? `Scene ${String(r.level).padStart(2, '0')}` : undefined}
  muted={!played}
  build={played ? null : build}
  heat={p?.heat ?? 100}
  onshown={(a) => (usedAr = a)}
/>

<div class="ui" class:done={played}>
  {#if !played}
    <div class="lock" role="status">
      <p class="mono">Hold here — locking the scene</p>
      <div class="bar"><span style="width: {Math.round(build * 100)}%"></span></div>
      {#if holdUp}<p class="warn">{holdUp}</p>{/if}
      {#if retrying}<p class="warn">Reconnecting…</p>{/if}
    </div>
  {:else}
    <div class="info">
      <p class="mono">
        Level {r?.level} · split {formatMarquee(r?.splitMs ?? 0)}{r?.penaltyMs
          ? ` · +${formatMarquee(r.penaltyMs)}`
          : ''}
      </p>
      <h1>{r?.locationName}</h1>
      <p class="film"><b>{r?.movie.title}</b> · filmed right here</p>
      <div class="fact">{r?.campusFact}</div>
      <div class="actions">
        {#if usedAr}
          <Button variant="secondary" onclick={() => screen?.recenter()}>
            <Icon name="crosshair" size={18} /> Recentre
          </Button>
          <Button variant="secondary" disabled={shooting} onclick={() => void takePhoto()}>
            <Icon name="camera" size={18} /> {shooting ? '…' : 'Photo'}
          </Button>
        {/if}
        <Button onclick={next}>{r?.huntComplete ? 'See your result' : 'Next scene'}</Button>
      </div>
    </div>
  {/if}
</div>

{#if shotUrl}
  <!-- Sharing and downloading were both refused, so show it for a long-press save. -->
  <div class="shot" role="dialog" aria-label="Your photo">
    <img src={shotUrl} alt="You at {r?.locationName ?? 'this scene'}" />
    <p>Press and hold the picture to save it.</p>
    <button onclick={() => (shotUrl = null)}>Done</button>
  </div>
{/if}

<style>
  .shot {
    position: fixed;
    inset: 0;
    z-index: 90;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: var(--sp-3);
    padding: var(--edge);
    background: rgba(6, 8, 10, 0.94);
  }
  .shot img {
    max-width: 100%;
    max-height: 68vh;
    border-radius: 10px;
    border: var(--glass-border);
  }
  .shot p {
    margin: 0;
    color: var(--text-dim);
    font-size: var(--step-15);
  }
  .shot button {
    padding: 12px 28px;
    border-radius: var(--radius-button);
    font-weight: 600;
    color: var(--amber-ink);
    background: var(--amber);
  }
  .ui {
    position: fixed;
    inset: 0;
    z-index: 10;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: flex-end;
    padding: calc(var(--safe-top) + var(--sp-6)) var(--edge) calc(var(--safe-bottom) + var(--sp-5));
    pointer-events: none;
  }
  .ui :global(button) {
    pointer-events: auto;
  }
  /* Cinemascope bars only once the scene is actually playing. */
  .ui.done::before {
    content: '';
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    height: 7vh;
    background: #000;
    animation: bar 0.6s var(--ease-spring);
  }
  .lock {
    width: 100%;
    max-width: 420px;
    text-align: center;
  }
  .bar {
    height: 3px;
    margin-top: var(--sp-2);
    border-radius: 2px;
    background: rgba(255, 255, 255, 0.16);
    overflow: hidden;
  }
  .bar span {
    display: block;
    height: 100%;
    background: var(--amber);
    transition: width 0.6s linear;
  }
  .warn {
    margin: var(--sp-2) 0 0;
    font-size: var(--step-13);
    color: var(--amber);
  }
  .info {
    width: 100%;
    max-width: 520px;
    padding: var(--sp-4);
    border-radius: var(--radius-card);
    background: var(--surface-raised);
    backdrop-filter: blur(var(--blur));
    border: var(--glass-border);
    border-top-color: var(--hairline-bright);
    animation: rise 0.8s var(--ease-spring) 0.4s both;
  }
  .mono {
    font-family: var(--font-mono);
    font-size: var(--step-13);
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: var(--text-dim);
    margin: 0;
    text-shadow: 0 1px 6px #000;
  }
  h1 {
    font-family: var(--font-display);
    font-weight: 400;
    font-size: var(--step-28);
    margin: var(--sp-2) 0 var(--sp-1);
  }
  .film {
    color: var(--text-dim);
    margin: 0 0 var(--sp-3);
  }
  .film b {
    color: var(--text);
  }
  .fact {
    padding: var(--sp-3);
    border-radius: 12px;
    background: rgba(0, 0, 0, 0.28);
    font-size: var(--step-15);
    margin-bottom: var(--sp-4);
  }
  .actions {
    display: flex;
    gap: var(--sp-3);
  }
  .actions :global(.primary) {
    flex: 1;
  }
  @keyframes rise {
    from {
      transform: translateY(16px);
      opacity: 0;
    }
  }
  @keyframes bar {
    from {
      transform: scaleY(0);
    }
  }
</style>
