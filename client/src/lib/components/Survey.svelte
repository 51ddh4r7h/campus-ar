<script lang="ts">
  /**
   * The post-game survey, on the finish screen.
   *
   * Five taps and done: a star rating, then one pick per question from the
   * shared `SURVEY` list — nobody types anything. Submitting stores the answers
   * as an event and drops a flag in localStorage so a replay or a refresh does
   * not ask again.
   *
   * Not shown in practice mode: those runs are the team testing, and their
   * answers would only muddy the real cohort's.
   */
  import {SURVEY, type Feedback} from '@cmh/shared'
  import {game} from '../stores/game.svelte'
  import {toasts} from '../stores/toast.svelte'
  import {api} from '../api'

  const DONE_KEY = 'cmh.feedbackDone'

  let done = $state(read(DONE_KEY))
  let stars = $state(0)
  let hovered = $state(0)
  let answers = $state<Record<string, string>>({})
  let sending = $state(false)

  const ready = $derived(stars > 0 && SURVEY.every((q) => answers[q.id]))

  function read(k: string): boolean {
    try {
      return localStorage.getItem(k) === '1'
    } catch {
      return false
    }
  }
  function markDone(): void {
    try {
      localStorage.setItem(DONE_KEY, '1')
    } catch {
      /* private mode — the in-memory flag still hides it for this view */
    }
  }

  async function submit(): Promise<void> {
    if (!ready || sending || !game.token) return
    sending = true
    // SAFETY: `ready` proved stars is 1–5 and every SURVEY id has an answer;
    // the values themselves are only ever set from each question's own options.
    const feedback = {stars, ...answers} as Feedback
    try {
      await api.submitFeedback(game.token, feedback)
      markDone()
      done = true
    } catch {
      toasts.show('Could not send that — try once more?', 'alert')
    } finally {
      sending = false
    }
  }
</script>

{#if !done}
  <section class="survey">
    <h2>How was it?</h2>
    <p class="sub">Five taps. It helps us make the next run better.</p>

    <fieldset class="stars" onmouseleave={() => (hovered = 0)}>
      <legend>Overall</legend>
      <div class="row">
        {#each [1, 2, 3, 4, 5] as n}
          <button
            type="button"
            class="star"
            class:lit={n <= (hovered || stars)}
            aria-pressed={n === stars}
            aria-label="{n} star{n > 1 ? 's' : ''}"
            onclick={() => (stars = n)}
            onmouseenter={() => (hovered = n)}
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path
                d="M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 17l-5.2 2.7 1-5.8-4.3-4.1 5.9-.9z"
              />
            </svg>
          </button>
        {/each}
      </div>
    </fieldset>

    {#each SURVEY as q (q.id)}
      <fieldset>
        <legend>{q.prompt}</legend>
        <div class="opts">
          {#each q.options as o (o.value)}
            <label class:on={answers[q.id] === o.value}>
              <input
                type="radio"
                name={q.id}
                value={o.value}
                checked={answers[q.id] === o.value}
                onchange={() => (answers = {...answers, [q.id]: o.value})}
              />
              <span>{o.label}</span>
            </label>
          {/each}
        </div>
      </fieldset>
    {/each}

    <button class="send" type="button" disabled={!ready || sending} onclick={submit}>
      {sending ? 'Sending…' : 'Send feedback'}
    </button>
  </section>
{:else}
  <section class="survey thanks">
    <h2>Thanks.</h2>
    <p class="sub">That goes straight to the people running this.</p>
  </section>
{/if}

<style>
  .survey {
    padding: var(--sp-4);
    border-radius: var(--radius-card);
    background: var(--surface);
    border: var(--glass-border);
    display: flex;
    flex-direction: column;
    gap: var(--sp-4);
  }
  h2 {
    margin: 0;
    font-family: var(--font-display);
    font-weight: 400;
    font-size: var(--step-20);
  }
  .sub {
    margin: calc(-1 * var(--sp-3)) 0 0;
    color: var(--text-dim);
    font-size: var(--step-15);
  }
  .thanks {
    gap: var(--sp-2);
  }

  .stars .row {
    display: flex;
    gap: var(--sp-2);
  }
  .star {
    flex: 1;
    aspect-ratio: 1;
    max-width: 52px;
    display: grid;
    place-items: center;
    border-radius: 12px;
    border: 1px solid var(--hairline);
    background: transparent;
  }
  .star svg {
    width: 62%;
    height: 62%;
    fill: none;
    stroke: var(--text-faint);
    stroke-width: 1.5;
    stroke-linejoin: round;
  }
  .star.lit svg {
    fill: var(--amber);
    stroke: var(--amber);
  }
  .star.lit {
    border-color: color-mix(in srgb, var(--amber) 40%, transparent);
    background: color-mix(in srgb, var(--amber) 10%, transparent);
  }

  fieldset {
    border: 0;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: var(--sp-2);
  }
  legend {
    padding: 0;
    font-size: var(--step-15);
    font-weight: 500;
  }
  .opts {
    display: flex;
    flex-wrap: wrap;
    gap: var(--sp-2);
  }
  label {
    display: inline-flex;
    align-items: center;
    padding: 8px 12px;
    border-radius: 999px;
    border: 1px solid var(--hairline);
    background: var(--surface-raised);
    font-size: var(--step-13);
    color: var(--text-dim);
    cursor: pointer;
  }
  label.on {
    border-color: var(--amber);
    color: var(--text);
    background: color-mix(in srgb, var(--amber) 12%, transparent);
  }
  input {
    position: absolute;
    width: 1px;
    height: 1px;
    opacity: 0;
    pointer-events: none;
  }
  /* The ring shows on the label when its hidden radio is focused. */
  label:has(input:focus-visible) {
    outline: 2px solid var(--amber);
    outline-offset: 2px;
  }

  .send {
    height: 48px;
    border-radius: var(--radius-button);
    border: 1px solid var(--amber);
    color: var(--amber);
    font-weight: 600;
    font-size: var(--step-15);
  }
  .send:disabled {
    opacity: 0.45;
  }
</style>
