<script lang="ts">
  /**
   * Sign in / create account for a cohort.
   *
   * Reached from the shared link `…/?e=<code>`. The code identifies the batch;
   * the player identifies themselves with their roll number and a password they
   * choose. Replaces the old "your entry link is personal" dead end — one link
   * now works for everyone.
   */
  import {eventCode, demoAllowed} from '../lib/mode'
  import {nav} from '../lib/stores/nav.svelte'
  import {game} from '../lib/stores/game.svelte'
  import {ApiError} from '../lib/api'
  import Button from '../lib/components/Button.svelte'
  import Icon from '../lib/components/Icon.svelte'

  let mode = $state<'signin' | 'signup'>('signup')
  let roll = $state('')
  let name = $state('')
  let password = $state('')
  let busy = $state(false)
  let error = $state<string | null>(null)

  const code = eventCode ?? ''

  const ready = $derived(
    roll.trim().length > 0 &&
      password.length >= (mode === 'signup' ? 6 : 1) &&
      (mode === 'signin' || name.trim().length > 0),
  )

  async function submit(e: SubmitEvent) {
    e.preventDefault()
    if (!ready || busy) return
    busy = true
    error = null
    try {
      if (mode === 'signup') {
        await game.signUp({eventCode: code, username: roll.trim(), name: name.trim(), password})
      } else {
        await game.logIn({eventCode: code, username: roll.trim(), password})
      }
      await game.refresh()
      nav.go(game.inProgress ? 'clue' : 'welcome')
    } catch (err) {
      error =
        err instanceof ApiError
          ? err.message
          : 'Something went wrong — check your connection and try again'
      // A "roll number already registered" points straight at the other tab.
      if (err instanceof ApiError && err.code === 'roster_taken') mode = 'signin'
    } finally {
      busy = false
    }
  }
</script>

<main>
  <div class="body">
    <div class="icon"><Icon name="pin" size={26} /></div>
    <h1>Campus Movie Hunt</h1>

    {#if !eventCode}
      <p class="lead">
        Open the event link you were given — it looks like <code>…/?e=…</code>.
      </p>
    {:else}
      <div class="tabs" role="tablist">
        <button role="tab" aria-selected={mode === 'signup'} onclick={() => (mode = 'signup')}>
          Create account
        </button>
        <button role="tab" aria-selected={mode === 'signin'} onclick={() => (mode = 'signin')}>
          Sign in
        </button>
      </div>

      <form onsubmit={submit}>
        <label>
          Roll number
          <input
            bind:value={roll}
            autocomplete="username"
            autocapitalize="characters"
            spellcheck="false"
            required
          />
        </label>

        {#if mode === 'signup'}
          <label>
            Your name
            <input bind:value={name} autocomplete="name" required />
          </label>
        {/if}

        <label>
          Password
          <input
            type="password"
            bind:value={password}
            autocomplete={mode === 'signup' ? 'new-password' : 'current-password'}
            minlength={mode === 'signup' ? 6 : undefined}
            required
          />
        </label>

        {#if error}<p class="error" role="alert">{error}</p>{/if}

        <Button type="submit" disabled={!ready || busy}>
          {busy ? 'One moment…' : mode === 'signup' ? 'Create account & play' : 'Sign in'}
        </Button>
      </form>
    {/if}
  </div>

  {#if demoAllowed}
    <div class="actions">
      <Button variant="text" onclick={() => nav.go('welcome')}>Try a practice run instead</Button>
    </div>
  {/if}
</main>

<style>
  main {
    min-height: 100dvh;
    display: flex;
    flex-direction: column;
    padding: calc(var(--safe-top) + var(--sp-7)) var(--edge) calc(var(--safe-bottom) + var(--sp-5));
  }
  .body {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--sp-3);
  }
  .icon {
    display: grid;
    place-items: center;
    width: 72px;
    height: 72px;
    border-radius: 999px;
    border: 1px solid var(--hairline);
    color: var(--amber);
    margin-bottom: var(--sp-2);
  }
  h1 {
    font-family: var(--font-display);
    font-weight: 400;
    font-size: var(--step-26);
    margin: 0 0 var(--sp-3);
    text-align: center;
  }
  .lead {
    color: var(--text-dim);
    max-width: 32ch;
    text-align: center;
  }
  code {
    font-family: var(--font-mono);
    color: var(--text);
  }
  .tabs {
    display: flex;
    width: 100%;
    max-width: 340px;
    border: 1px solid var(--hairline);
    border-radius: 999px;
    padding: 3px;
    margin-bottom: var(--sp-2);
  }
  .tabs button {
    flex: 1;
    padding: var(--sp-2);
    border-radius: 999px;
    font-size: var(--step-14);
    color: var(--text-dim);
  }
  .tabs button[aria-selected='true'] {
    background: var(--amber);
    color: var(--amber-ink);
    font-weight: 600;
  }
  form {
    display: flex;
    flex-direction: column;
    gap: var(--sp-3);
    width: 100%;
    max-width: 340px;
  }
  label {
    display: flex;
    flex-direction: column;
    gap: 6px;
    font-size: var(--step-13);
    color: var(--text-dim);
  }
  input {
    min-height: 44px;
    padding: 0 var(--sp-3);
    border-radius: var(--radius-card, 10px);
    border: 1px solid var(--hairline);
    background: var(--surface);
    color: var(--text);
    font-size: var(--step-16);
  }
  input:focus-visible {
    outline: 2px solid var(--amber);
    outline-offset: 1px;
  }
  .error {
    margin: 0;
    color: var(--alert, #e06c5a);
    font-size: var(--step-14);
  }
  form :global(.primary) {
    width: 100%;
    margin-top: var(--sp-2);
  }
  .actions {
    display: flex;
    justify-content: center;
  }
</style>
