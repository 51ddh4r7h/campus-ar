<script lang="ts">
  import {formatMarquee} from '@cmh/shared'
  import {nav} from '../lib/stores/nav.svelte'
  import {game} from '../lib/stores/game.svelte'
  import {clock} from '../lib/stores/clock.svelte'
  import {toasts} from '../lib/stores/toast.svelte'
  import {ApiError} from '../lib/api'
  import {readableError} from '../lib/errors'
  import {revealVideo} from '../lib/reveal-video'
  import {camera} from '../lib/stores/camera.svelte'
  import {ar} from '../lib/stores/ar.svelte'

  const resuming = $derived(game.inProgress || game.paused)

  /**
   * A hunt that is already over does not belong on this screen.
   *
   * It can land here when the client's view of the session is behind the
   * server's — the six-hour cap or an organiser closing the batch both end a
   * hunt underneath an app that is still open. Without this the screen offers
   * START, and the server answers `already_started`.
   */
  $effect(() => {
    if (game.finished) nav.go('finish')
  })
  let starting = $state(false)
  let confirming = $state(false)
  let ending = $state(false)

  /**
   * Re-read the session and follow it. True when it moved us somewhere, which
   * means the failure has been dealt with and needs no message.
   */
  async function resync(): Promise<boolean> {
    await game.refresh()
    if (game.finished) {
      nav.go('finish')
      return true
    }
    if (game.inProgress) {
      nav.go('clue')
      return true
    }
    return false
  }

  async function endNow() {
    ending = true
    try {
      await game.abandon()
      nav.go('finish')
    } catch {
      toasts.show('Could not end the hunt — try again', 'alert')
      ending = false
    }
  }

  /**
   * Everything that needs a real user gesture, spent before the first await.
   *
   * The camera is why this matters. A resumed session used to route straight
   * to the clue, and the camera was then started from a reactive effect on the
   * search screen — not from a gesture. Safari refuses getUserMedia outside a
   * gesture without even prompting, which is exactly the reported symptom: no
   * camera, and no permission dialog either. Asking here, on a real tap, is
   * the fix — and it has to happen synchronously, because the gesture does not
   * survive an await.
   */
  function spendGesture(): void {
    const v = revealVideo()
    v.muted = true
    void v.play().catch(() => {})
    void camera.start()
    void ar.ensure()
  }

  /**
   * Why a start failed, in the player's words.
   *
   * Blaming the network for everything sent a real server fault looking like a
   * wifi problem. `net.online` already knows whether the request even left the
   * device, so say which it was.
   */
  function startFailure(err: ApiError | null): string {
    const fallback = 'Could not start. Try again, or tell an organiser.'
    if (!game.online) return "Can't reach the server — check your connection"
    return err ? readableError(err.code, fallback) : fallback
  }

  async function resumeHunt(): Promise<void> {
    try {
      // A paused session has to be un-paused before anything will validate.
      if (game.paused) await game.resume()
      nav.go('clue')
    } catch {
      toasts.show('Could not resume — try again', 'alert')
      starting = false
    }
  }

  async function beginHunt(): Promise<void> {
    try {
      await game.start()
      nav.go('clue')
    } catch (err) {
      starting = false
      const failed = err instanceof ApiError ? err : null

      // A 409 means this screen is out of date, not that the player did
      // something wrong. Ask the server where they actually are and go there.
      if (failed?.status === 409 && (await resync())) return

      toasts.show(startFailure(failed), 'alert')
    }
  }

  async function go(): Promise<void> {
    spendGesture()
    starting = true
    await (resuming ? resumeHunt() : beginHunt())
  }
</script>

<main>
  {#if game.demo}<span class="chip">Demo</span>{/if}
  <div class="center">
    <p class="label">
      {game.paused ? 'Paused' : resuming ? `You're on level ${game.level}` : "When you're ready"}
    </p>
    <button class="start" class:busy={starting} onclick={go} disabled={starting}>
      <span>{starting ? '…' : resuming ? 'RESUME' : 'START'}</span>
    </button>
    {#if resuming}
      <p class="sub mono">{formatMarquee(clock.remainingMs)} left</p>
    {:else}
      <p class="sub">Your timer starts the moment you tap.</p>
    {/if}
    <button class="rules" onclick={() => nav.open('howto')}>Read the rules again</button>
    <!-- Reachable without finishing: a browser can end up on the wrong session
         entirely, and there was no way off it from here. -->
    <button class="rules quit" onclick={() => (game.reset(), nav.go('hero'))}>
      {game.demo ? 'Leave practice' : 'Sign out'}
    </button>

    {#if resuming}
      <!-- Deliberately plain and deliberately two taps. It is the only action
           in the game that cannot be undone, and it is sitting next to the one
           people press to carry on. -->
      {#if confirming}
        <p class="warn">Your hunt ends here and is scored on what you found.</p>
        <div class="row">
          <button class="danger" disabled={ending} onclick={() => void endNow()}>
            {ending ? 'Ending…' : 'Yes, end it'}
          </button>
          <button class="rules" onclick={() => (confirming = false)}>Keep playing</button>
        </div>
      {:else}
        <button class="rules quit" onclick={() => (confirming = true)}>End the hunt early</button>
      {/if}
    {/if}
  </div>
</main>

<style>
  main {
    min-height: 100dvh;
    display: grid;
    place-items: center;
    padding: var(--edge);
  }
  .warn {
    margin: var(--sp-5) 0 var(--sp-2);
    color: var(--text-dim);
    font-size: var(--step-13);
    max-width: 30ch;
  }
  .row {
    display: flex;
    align-items: center;
    gap: var(--sp-3);
  }
  .danger {
    padding: var(--sp-2) var(--sp-4);
    border-radius: 999px;
    border: 1px solid color-mix(in srgb, var(--alert) 55%, transparent);
    background: color-mix(in srgb, var(--alert) 16%, transparent);
    color: var(--text);
    font-size: var(--step-13);
  }
  .quit {
    color: var(--text-faint);
  }
  .rules {
    margin-top: var(--sp-6);
    padding: var(--sp-2) var(--sp-4);
    border-radius: 999px;
    border: 1px solid var(--hairline);
    color: var(--text-dim);
    font-size: var(--step-13);
  }
  .chip {
    position: fixed;
    top: calc(var(--safe-top) + var(--sp-3));
    right: var(--edge);
    font-size: var(--step-13);
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--text-dim);
    padding: 5px 10px;
    border-radius: 999px;
    background: var(--surface);
    border: var(--glass-border);
  }
  .center {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--sp-6);
    text-align: center;
  }
  .label {
    font-size: var(--step-13);
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: var(--text-dim);
    margin: 0;
  }
  .start {
    width: 148px;
    height: 148px;
    border-radius: 999px;
    border: 2px solid var(--amber);
    background: radial-gradient(circle at 50% 40%, rgba(232, 165, 76, 0.14), transparent 70%);
    color: var(--text);
    font-weight: 700;
    letter-spacing: 0.06em;
    box-shadow: 0 0 40px rgba(232, 165, 76, 0.15);
    transition: transform var(--dur-standard) var(--ease-spring);
    animation: pulse 2.4s ease-in-out infinite;
  }
  .start:active {
    transform: scale(0.95);
    background: var(--amber);
    color: var(--amber-ink);
  }
  .start.busy {
    opacity: 0.6;
    animation: none;
  }
  .sub {
    color: var(--text-dim);
    margin: 0;
    max-width: 28ch;
  }
  .mono {
    font-family: var(--font-mono);
    font-variant-numeric: tabular-nums;
    color: var(--amber);
  }
  @keyframes pulse {
    50% {
      box-shadow: 0 0 60px rgba(232, 165, 76, 0.28);
    }
  }
</style>
