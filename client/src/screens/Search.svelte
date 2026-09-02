<script lang="ts">
  /**
   * Searching. The camera is a viewfinder, not a scanner — nothing is aimed at
   * and nothing is read. Arrival is decided by GPS alone, so the only things on
   * screen are the ones that actually help: how warm you are, and the shot you
   * are trying to match.
   */
  import {nav} from '../lib/stores/nav.svelte'
  import {game} from '../lib/stores/game.svelte'
  import {location} from '../lib/stores/location.svelte'
  import {probe} from '../lib/stores/probe.svelte'
  import {toasts} from '../lib/stores/toast.svelte'
  import {revealVideo} from '../lib/reveal-video'
  import {formatMarquee} from '@cmh/shared'
  import HudBar from '../lib/components/HudBar.svelte'
  import CameraFeed from '../lib/components/CameraFeed.svelte'
  import HeatMeter from '../lib/components/HeatMeter.svelte'
  import ProximityRing from '../lib/components/ProximityRing.svelte'
  import Icon from '../lib/components/Icon.svelte'

  const clue = $derived(game.clue)

  /**
   * How strongly the original frame is ghosted over the live camera. Held down
   * it fades in; released it fades out, so a flick back and forth is how you
   * check an alignment — the comparison has to happen against the real view,
   * which is exactly what the old full-screen still made impossible.
   *
   * The still keeps its own shape rather than filling the phone. Stretching a
   * 2.39:1 frame over a tall screen crops away most of the composition, which
   * is the very thing being matched.
   */
  let blend = $state(0)
  let holding = $state(false)

  const video = revealVideo()
  const free = $derived(game.freeViewsLeft)

  /**
   * Park the shared clip inside the ghost frame while this screen is up. It is
   * the same element the AR screen uses, so it is borrowed rather than copied —
   * one <video> means one decode, and no second download.
   */
  function stage(node: Element) {
    video.loop = true
    video.muted = true
    Object.assign(video.style, {
      position: 'static',
      width: '100%',
      height: 'auto',
      opacity: '1',
      zIndex: '0',
      display: 'block',
    })
    node.appendChild(video)
    return () => {
      video.pause()
      Object.assign(video.style, {
        position: 'fixed',
        right: '0',
        bottom: '0',
        width: '2px',
        height: '2px',
        opacity: '0',
        zIndex: '-1',
      })
      document.body.appendChild(video)
    }
  }

  function hold(on: boolean): void {
    holding = on
    blend = on ? 1 : 0
    if (!on) {
      video.pause()
      return
    }
    // Every hold is a viewing. Two a level are free; the rest cost time, so
    // say what it cost rather than quietly moving the score.
    video.currentTime = 0
    void video.play().catch(() => {})
    void game.view().then((penaltyMs) => {
      if (penaltyMs > 0) toasts.show(`Another look — +${formatMarquee(penaltyMs)}`, 'alert')
    })
  }
</script>

<CameraFeed />

<HudBar />
<HeatMeter />

<!-- The last stretch only. GPS is good to ±10-20m out here, which is the whole
     of the final leg, so this is drawn around the player rather than on the
     target: a ring centred on you cannot be misplaced by your own position
     error, and a circle cannot accidentally point anywhere. -->
<ProximityRing heat={probe.last?.heat ?? 0} />

{#if clue}
  <!-- The frame you are hunting, laid over the world at whatever strength
       you are holding. -->
  <div class="ghost" class:lifted={holding} style="opacity: {blend * 0.82}" aria-hidden="true">
    <div class="frame" {@attach stage}></div>
  </div>
{/if}

{#if !location.hasSignal}
  <p class="signal" role="status">Move to more open ground for a signal</p>
{/if}

<nav class="bar">
  <button onclick={() => nav.open('hint')}>
    <Icon name="bulb" size={22} /><span>Hint</span>
  </button>

  <button
    class="hold"
    class:on={holding}
    aria-pressed={holding}
    onpointerdown={() => hold(true)}
    onpointerup={() => hold(false)}
    onpointerleave={() => hold(false)}
    oncontextmenu={(e) => e.preventDefault()}
  >
    <Icon name="eye" size={22} />
    <span>{holding ? 'Release' : free > 0 ? `Compare · ${free} free` : 'Compare · costs time'}</span>
  </button>

  <button onclick={() => nav.open('standings')}>
    <Icon name="trophy" size={22} /><span>Standings</span>
  </button>
</nav>

<style>
  .ghost {
    position: fixed;
    top: 50%;
    left: 0;
    right: 0;
    transform: translateY(-50%);
    z-index: 6;
    pointer-events: none;
    transition: opacity 0.22s ease;
  }
  /* Natural aspect: the frame you are matching, at the shape it was shot. */
  .ghost .frame {
    display: block;
    width: 100%;
    line-height: 0;
  }
  /* A hairline while it's up, so you can see where the frame ends. */
  .ghost.lifted .frame {
    outline: 2px solid color-mix(in srgb, var(--amber) 60%, transparent);
    outline-offset: -2px;
  }
  .signal {
    position: fixed;
    top: 58%;
    left: 0;
    right: 0;
    text-align: center;
    color: var(--text-dim);
    font-size: var(--step-15);
    z-index: 10;
    margin: 0;
    padding: 0 var(--edge);
    text-shadow: 0 1px 6px #000;
  }
  .bar {
    position: fixed;
    left: var(--edge);
    right: var(--edge);
    bottom: calc(var(--safe-bottom) + var(--sp-3));
    z-index: 20;
    display: flex;
    justify-content: space-around;
    padding: var(--sp-3) var(--sp-2);
    border-radius: var(--radius-card);
    background: var(--surface);
    backdrop-filter: blur(var(--blur));
    border: var(--glass-border);
    border-top-color: var(--hairline-bright);
    box-shadow: var(--glass-shadow);
  }
  .bar button {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 4px;
    color: var(--text);
    font-size: var(--step-13);
    padding: var(--sp-1) var(--sp-3);
    text-align: center;
  }
  .bar :global(svg) {
    color: var(--amber);
  }
  .hold {
    touch-action: none;
    -webkit-user-select: none;
    user-select: none;
  }
  .hold.on {
    color: var(--amber);
  }
</style>
