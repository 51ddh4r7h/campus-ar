<script lang="ts">
  /**
   * Sign in, or create an account, for one cohort.
   *
   * Reached from the shared link `…/?e=<code>`. The code identifies the event;
   * a player identifies themselves with their roll number and a password they
   * choose. The event's real name is fetched and shown, so someone handed a
   * link can see at a glance that they are in the right place rather than
   * typing their details into a guess.
   */
  import {onMount} from 'svelte'
  import {eventCode} from '../lib/mode'
  import {nav} from '../lib/stores/nav.svelte'
  import {game} from '../lib/stores/game.svelte'
  import {api, ApiError} from '../lib/api'
  import Button from '../lib/components/Button.svelte'
  import SceneBackdrop from '../lib/components/SceneBackdrop.svelte'
  import EdgeBlur from '../lib/components/EdgeBlur.svelte'

  const code = eventCode ?? ''

  let mode = $state<'signup' | 'signin'>('signup')
  let roll = $state('')
  let name = $state('')
  let password = $state('')
  let show = $state(false)
  let busy = $state(false)
  let error = $state<string | null>(null)

  /** null while loading, false when the code is bad — both worth saying. */
  let eventName = $state<string | null | false>(null)

  const isSignup = $derived(mode === 'signup')
  const ready = $derived(
    roll.trim().length > 0 &&
      password.length >= (isSignup ? 6 : 1) &&
      (!isSignup || name.trim().length > 0),
  )

  onMount(async () => {
    try {
      eventName = (await api.event(code)).name
    } catch {
      eventName = false
    }
  })

  async function submit(e: SubmitEvent) {
    e.preventDefault()
    if (!ready || busy) return
    busy = true
    error = null
    try {
      if (isSignup) {
        await game.signUp({eventCode: code, username: roll.trim(), name: name.trim(), password})
      } else {
        await game.logIn({eventCode: code, username: roll.trim(), password})
      }
      await game.refresh()
      // Straight on to the briefing — the account is made, don't stall them.
      nav.go(game.inProgress ? 'clue' : 'briefing')
    } catch (err) {
      if (err instanceof ApiError) {
        error = err.message
        // "Already registered" is not a failure, it is the wrong tab. Move them
        // to it and keep what they have already typed.
        if (err.code === 'roster_taken') {
          mode = 'signin'
          error = 'That roll number is already registered — sign in instead.'
        }
      } else {
        error = 'Something went wrong. Check your connection and try again.'
      }
    } finally {
      busy = false
    }
  }
</script>

<SceneBackdrop />
<EdgeBlur height="64vh" strength={18} />

<main>
  <button class="back" onclick={() => nav.go('hero')} aria-label="Back">←</button>

  <div class="head">
    <span class="eyebrow">
      {#if eventName === null}Checking your link…{:else if eventName === false}Link not recognised{:else}{eventName}{/if}
    </span>
    <h1>{isSignup ? 'Create your account' : 'Welcome back'}</h1>
    <p class="sub">
      {isSignup
        ? 'Your roll number is your username. Pick a password you can remember on the walk.'
        : 'Same roll number and password you signed up with.'}
    </p>
  </div>

  {#if eventName === false}
    <p class="dead">
      This link doesn't match an event. Check you copied all of it, or ask the organiser for a
      fresh one.
    </p>
  {:else}
    <div class="tabs" role="tablist" aria-label="Sign in or create an account">
      <button role="tab" aria-selected={isSignup} onclick={() => ((mode = 'signup'), (error = null))}>
        Create account
      </button>
      <button role="tab" aria-selected={!isSignup} onclick={() => ((mode = 'signin'), (error = null))}>
        Sign in
      </button>
    </div>

    <form onsubmit={submit}>
      <label>
        <span>Roll number</span>
        <input
          bind:value={roll}
          autocomplete="username"
          autocapitalize="characters"
          autocorrect="off"
          spellcheck="false"
          enterkeyhint="next"
          placeholder="21B-1042"
          required
        />
      </label>

      {#if isSignup}
        <label>
          <span>Your name</span>
          <input
            bind:value={name}
            autocomplete="name"
            enterkeyhint="next"
            placeholder="How you'll appear on the board"
            required
          />
        </label>
      {/if}

      <label>
        <span>Password</span>
        <div class="pw">
          <input
            type={show ? 'text' : 'password'}
            bind:value={password}
            autocomplete={isSignup ? 'new-password' : 'current-password'}
            enterkeyhint="go"
            minlength={isSignup ? 6 : undefined}
            required
          />
          <button type="button" class="peek" onclick={() => (show = !show)}>
            {show ? 'Hide' : 'Show'}
          </button>
        </div>
        {#if isSignup}<small>At least 6 characters.</small>{/if}
      </label>

      {#if error}<p class="error" role="alert">{error}</p>{/if}

      <Button type="submit" disabled={!ready || busy}>
        {busy ? 'One moment…' : isSignup ? 'Create account' : 'Sign in'}
      </Button>
    </form>
  {/if}
</main>

<style>
  main {
    position: relative;
    z-index: 1;
    min-height: 100dvh;
    display: flex;
    flex-direction: column;
    gap: var(--sp-6);
    padding: calc(var(--safe-top) + var(--sp-6)) var(--edge) calc(var(--safe-bottom) + var(--sp-8));
  }
  .back {
    align-self: flex-start;
    width: 40px;
    height: 40px;
    border-radius: 999px;
    border: 1px solid var(--hairline);
    background: var(--surface);
    backdrop-filter: blur(var(--blur));
    color: var(--text);
    font-size: var(--step-20);
    line-height: 1;
  }
  .head {
    margin-top: auto;
  }
  .eyebrow {
    display: block;
    font-family: var(--font-mono);
    font-size: var(--step-13);
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: var(--amber);
    margin-bottom: var(--sp-3);
  }
  h1 {
    font-family: var(--font-display);
    font-weight: 400;
    font-size: clamp(2rem, 8.5vw, 2.6rem);
    line-height: 1.02;
    margin: 0 0 var(--sp-3);
  }
  .sub {
    margin: 0;
    color: var(--text-dim);
    font-size: var(--step-15);
    max-width: 34ch;
  }
  .dead {
    margin: 0 0 auto;
    color: var(--text-dim);
    font-size: var(--step-15);
  }

  .tabs {
    display: flex;
    border: 1px solid var(--hairline);
    border-radius: 999px;
    padding: 4px;
    background: var(--surface);
    backdrop-filter: blur(var(--blur));
  }
  .tabs button {
    flex: 1;
    min-height: 40px;
    border-radius: 999px;
    font-size: var(--step-15);
    color: var(--text-dim);
    transition: background var(--dur-fast) ease, color var(--dur-fast) ease;
  }
  .tabs button[aria-selected='true'] {
    background: var(--amber);
    color: var(--amber-ink);
    font-weight: 600;
  }

  form {
    display: flex;
    flex-direction: column;
    gap: var(--sp-4);
    margin-bottom: auto;
  }
  label {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  label > span {
    font-size: var(--step-13);
    color: var(--text-dim);
  }
  input {
    width: 100%;
    min-height: 50px;
    padding: 0 var(--sp-4);
    border-radius: 14px;
    border: 1px solid var(--hairline);
    background: var(--surface-raised);
    backdrop-filter: blur(var(--blur));
    color: var(--text);
    /* 16px minimum or iOS Safari zooms the whole page on focus. */
    font-size: 16px;
  }
  input::placeholder {
    color: var(--text-faint);
  }
  .pw {
    position: relative;
    display: flex;
  }
  .pw input {
    padding-right: 68px;
  }
  .peek {
    position: absolute;
    right: 6px;
    top: 50%;
    transform: translateY(-50%);
    padding: var(--sp-2) var(--sp-3);
    border-radius: 10px;
    font-size: var(--step-13);
    color: var(--text-dim);
  }
  small {
    color: var(--text-faint);
    font-size: var(--step-13);
  }
  .error {
    margin: 0;
    padding: var(--sp-3);
    border-radius: 12px;
    background: color-mix(in srgb, var(--alert) 16%, transparent);
    border: 1px solid color-mix(in srgb, var(--alert) 40%, transparent);
    color: var(--text);
    font-size: var(--step-15);
  }
  form :global(.primary) {
    width: 100%;
    margin-top: var(--sp-2);
  }

  /**
   * Short phones. At 360x640 the submit button fell below the fold — three
   * fields, a header and a tab bar do not fit a 640px screen at full spacing,
   * and a sign-up you have to scroll to complete is a sign-up people abandon.
   * The supporting copy is the first thing to go; the fields and the button are
   * what matter.
   */
  @media (max-height: 740px) {
    main {
      gap: var(--sp-4);
      padding-top: calc(var(--safe-top) + var(--sp-3));
    }
    .head {
      margin-top: 0;
    }
    h1 {
      font-size: 1.7rem;
      margin-bottom: var(--sp-2);
    }
    .sub {
      display: none;
    }
    form {
      gap: var(--sp-3);
    }
    input {
      min-height: 46px;
    }
  }
</style>
