<script lang="ts">
  /**
   * The first thing anyone sees.
   *
   * Replaces the old splash + welcome + "your link is personal" trio, which
   * between them showed the title twice and put a dead end where a call to
   * action belonged. One screen now: what this is, what you'll do, and the way
   * in — over real frames from the films that were shot here.
   */
  import {eventCode, demoAllowed} from '../lib/mode'
  import {nav} from '../lib/stores/nav.svelte'
  import Button from '../lib/components/Button.svelte'
  import Icon from '../lib/components/Icon.svelte'
  import EdgeBlur from '../lib/components/EdgeBlur.svelte'
  import Sheen from '../lib/components/Sheen.svelte'
  import TrueFocus from '../lib/components/bits/TrueFocus.svelte'
  import {isInAppBrowser} from '../lib/env'

  /**
   * The beam is three.js and three.js is a 730KB chunk, so it is imported only
   * when this screen mounts rather than sitting in the entry bundle. Loading it
   * here is not purely a cost either: the AR stage needs the same chunk at the
   * first reveal, and fetching it while someone reads the hero is a better
   * moment than fetching it while they are standing in a car park waiting for a
   * scene to play.
   */
  const beam = import('../lib/components/bits/LaserFlow.svelte')

  const inApp = isInAppBrowser()

  const steps = [
    {icon: 'play', text: 'Watch a scene'},
    {icon: 'eye', text: 'Recognise the place'},
    {icon: 'pin', text: 'Walk there and watch it come alive'},
  ] as const
</script>

<!-- The projector. Sits behind everything, pointing down the screen. -->
<div class="beam" aria-hidden="true">
  {#await beam then LaserFlow}
    <LaserFlow.default
      color="#e8a54c"
      dpr={1}
      horizontalBeamOffset={0.0}
      verticalBeamOffset={-0.42}
      verticalSizing={1.9}
      horizontalSizing={0.62}
      flowSpeed={0.28}
      fogIntensity={0.38}
      wispIntensity={4}
      wispDensity={0.8}
      mouseTiltStrength={0}
    />
  {/await}
</div>
<EdgeBlur height="46vh" />

<main>
  {#if inApp}
    <div class="warn" role="status">
      Open this link in <b>Safari</b> or <b>Chrome</b> — the camera won't work in this app's browser.
    </div>
  {/if}

  <div class="top">
    <span class="eyebrow"><Sheen text="Shot on this campus" /></span>
    <h1><TrueFocus sentence="Campus Movie Hunt" blurAmount={6} /></h1>
    <p class="tag">Five scenes were filmed here. Find where.</p>
  </div>

  <ol class="steps">
    {#each steps as s, i (s.text)}
      <li style="--i: {i}">
        <span class="dot"><Icon name={s.icon} size={17} /></span>
        {s.text}
      </li>
    {/each}
  </ol>

  <div class="actions">
    {#if eventCode}
      <Button onclick={() => nav.go('signin')}>Get started</Button>
      {#if demoAllowed}
        <Button variant="text" onclick={() => nav.go('briefing')}>Try a practice run</Button>
      {/if}
    {:else if demoAllowed}
      <Button onclick={() => nav.go('briefing')}>Try a practice run</Button>
    {:else}
      <p class="need-link">
        Open the event link you were given — it looks like <code>…/?e=…</code>
      </p>
    {/if}
  </div>
</main>

<style>
  main {
    position: relative;
    z-index: 1;
    min-height: 100dvh;
    display: flex;
    flex-direction: column;
    justify-content: flex-end;
    gap: var(--sp-8);
    padding: calc(var(--safe-top) + var(--sp-8)) var(--edge) calc(var(--safe-bottom) + var(--sp-8));
  }
  /* Behind the copy, and darkened at the bottom by EdgeBlur so the beam never
     competes with the words. */
  .beam {
    position: fixed;
    inset: 0;
    z-index: 0;
    pointer-events: none;
    background: var(--bg);
  }
  /* The beam splashes where it hits, and that splash was landing on the title.
     The words win: everything below the beam's pool is taken back to near-black
     so the copy always reads. */
  .beam::after {
    content: '';
    position: absolute;
    inset: 0;
    background: linear-gradient(
      to bottom,
      transparent 0%,
      rgba(10, 11, 13, 0.55) 24%,
      rgba(10, 11, 13, 0.94) 40%,
      var(--bg) 56%
    );
  }
  .warn {
    position: fixed;
    top: calc(var(--safe-top) + var(--sp-2));
    left: var(--edge);
    right: var(--edge);
    padding: var(--sp-3);
    border-radius: 12px;
    font-size: var(--step-13);
    color: var(--amber-ink);
    background: var(--amber);
    z-index: 5;
  }

  /* Everything above the fold rises in on load — the title first, then the
     steps in sequence. Cheap, and it makes the screen feel authored. */
  .top,
  .steps li,
  .actions {
    animation: rise 0.7s var(--ease-spring) both;
  }
  .top {
    margin-top: auto;
  }
  .steps li {
    animation-delay: calc(0.14s + var(--i) * 0.08s);
  }
  .actions {
    animation-delay: 0.42s;
  }
  @keyframes rise {
    from {
      opacity: 0;
      transform: translateY(14px);
    }
  }

  .eyebrow {
    display: block;
    font-family: var(--font-mono);
    font-size: var(--step-13);
    letter-spacing: 0.14em;
    text-transform: uppercase;
    color: var(--amber);
    margin-bottom: var(--sp-3);
  }
  h1 {
    font-family: var(--font-display);
    font-weight: 400;
    font-size: clamp(2.9rem, 13vw, 3.8rem);
    line-height: 0.94;
    margin: 0 0 var(--sp-4);
    text-wrap: balance;
  }
  .tag {
    color: var(--text-dim);
    margin: 0;
    max-width: 26ch;
    font-size: var(--step-20);
  }

  .steps {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: var(--sp-4);
  }
  .steps li {
    display: flex;
    align-items: center;
    gap: var(--sp-3);
    font-size: var(--step-15);
  }
  .dot {
    flex: none;
    display: grid;
    place-items: center;
    width: 34px;
    height: 34px;
    border-radius: 999px;
    color: var(--amber);
    border: 1px solid var(--hairline);
    background: var(--surface);
    backdrop-filter: blur(var(--blur));
  }

  .actions {
    display: flex;
    flex-direction: column;
    align-items: stretch;
    gap: var(--sp-2);
  }
  .actions :global(.primary) {
    width: 100%;
  }
  @media (max-height: 740px) {
    main {
      gap: var(--sp-6);
      padding-bottom: calc(var(--safe-bottom) + var(--sp-4));
    }
    h1 {
      font-size: 2.5rem;
    }
    .tag {
      font-size: var(--step-17);
    }
    .steps {
      gap: var(--sp-3);
    }
  }
  .need-link {
    margin: 0;
    text-align: center;
    color: var(--text-dim);
    font-size: var(--step-15);
  }
  code {
    font-family: var(--font-mono);
    color: var(--text);
  }
</style>
