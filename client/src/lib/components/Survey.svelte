<script lang="ts">
  /**
   * The post-game survey, one question to a screen.
   *
   * A star rating then the four questions from the shared `SURVEY` list, each
   * shown on its own with room to breathe — pick an answer, press Next. Every
   * answer is a tap; nobody types. The last step submits, storing the whole set
   * as one event and dropping a localStorage flag so a replay or a refresh does
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
  /** Step 0 is the stars; 1..4 are the survey questions. */
  const STEPS = SURVEY.length + 1

  let done = $state(read(DONE_KEY))
  let step = $state(0)
  let stars = $state(0)
  let hovered = $state(0)
  let answers = $state<Record<string, string>>({})
  let sending = $state(false)

  const question = $derived(step === 0 ? null : SURVEY[step - 1])
  const answered = $derived(step === 0 ? stars > 0 : Boolean(question && answers[question.id]))
  const last = $derived(step === STEPS - 1)

  /**
   * Answering advances on its own after a beat — long enough to see the choice
   * land and change your mind, short enough not to feel stuck. The last step is
   * the exception: submitting stays a deliberate tap.
   */
  let advanceTimer: ReturnType<typeof setTimeout> | undefined
  function armAdvance(): void {
    clearTimeout(advanceTimer)
    if (last) return
    advanceTimer = setTimeout(() => {
      step += 1
    }, 480)
  }
  function stopAdvance(): void {
    clearTimeout(advanceTimer)
  }

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

  function next(): void {
    stopAdvance()
    if (!answered) return
    if (last) void submit()
    else step += 1
  }

  function back(): void {
    stopAdvance()
    step -= 1
  }

  async function submit(): Promise<void> {
    if (sending || !game.token) return
    sending = true
    // SAFETY: reaching the last step means every earlier step was answered —
    // stars is 1–5 and every SURVEY id has a value, each only ever set from
    // that question's own options.
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

{#if done}
  <section class="survey thanks">
    <h2>Thanks.</h2>
    <p class="sub">That goes straight to the people running this.</p>
  </section>
{:else}
  <section class="survey">
    <header>
      <span class="count">{step + 1} of {STEPS}</span>
      <div class="dots" aria-hidden="true">
        {#each Array.from({length: STEPS}), i}
          <span class:on={i <= step}></span>
        {/each}
      </div>
    </header>

    {#if step === 0}
      <div class="body">
        <h2>How was it, overall?</h2>
        <fieldset class="stars" onmouseleave={() => (hovered = 0)}>
          <legend class="sr-only">Overall rating, one to five stars</legend>
          <div class="row">
            {#each [1, 2, 3, 4, 5] as n}
              <button
                type="button"
                class="star"
                class:lit={n <= (hovered || stars)}
                aria-pressed={n === stars}
                aria-label="{n} star{n > 1 ? 's' : ''}"
                onclick={() => {
                  stars = n
                  armAdvance()
                }}
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
      </div>
    {:else if question}
      <div class="body">
        <h2>{question.prompt}</h2>
        <fieldset class="opts">
          <legend class="sr-only">{question.prompt}</legend>
          {#each question.options as o (o.value)}
            <label class:on={answers[question.id] === o.value}>
              <input
                type="radio"
                name={question.id}
                value={o.value}
                checked={answers[question.id] === o.value}
                onchange={() => {
                  answers = {...answers, [question.id]: o.value}
                  armAdvance()
                }}
              />
              <span>{o.label}</span>
            </label>
          {/each}
        </fieldset>
      </div>
    {/if}

    <div class="nav">
      {#if step > 0}
        <button type="button" class="back" onclick={back}>Back</button>
      {/if}
      <button type="button" class="next" disabled={!answered || sending} onclick={next}>
        {sending ? 'Sending…' : last ? 'Send feedback' : 'Next'}
      </button>
    </div>
  </section>
{/if}

<style>
  .survey {
    padding: var(--sp-6) var(--sp-4);
    border-radius: var(--radius-card);
    background: var(--surface);
    border: var(--glass-border);
    display: flex;
    flex-direction: column;
    gap: var(--sp-6);
  }
  .thanks {
    gap: var(--sp-2);
  }

  header {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }
  .count {
    font-family: var(--font-mono);
    font-size: var(--step-13);
    color: var(--text-faint);
    letter-spacing: 0.04em;
  }
  .dots {
    display: flex;
    gap: 6px;
  }
  .dots span {
    width: 6px;
    height: 6px;
    border-radius: 999px;
    background: var(--hairline);
    transition: background var(--dur-fast) ease;
  }
  .dots span.on {
    background: var(--amber);
  }

  .body {
    display: flex;
    flex-direction: column;
    gap: var(--sp-6);
    /* The star step is short; hold a little height so it feels like the same
       card as the question steps rather than a sudden small one. */
    min-height: 168px;
  }
  h2 {
    margin: 0;
    font-family: var(--font-display);
    font-weight: 400;
    font-size: var(--step-20);
    line-height: 1.2;
  }
  .sub {
    margin: calc(-1 * var(--sp-3)) 0 0;
    color: var(--text-dim);
    font-size: var(--step-15);
  }

  fieldset {
    border: 0;
    margin: 0;
    padding: 0;
  }
  .sr-only {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip: rect(0 0 0 0);
  }

  .stars .row {
    display: flex;
    gap: var(--sp-3);
  }
  .star {
    flex: 1;
    aspect-ratio: 1;
    max-width: 58px;
    display: grid;
    place-items: center;
    border-radius: 14px;
    border: 1px solid var(--hairline);
    background: transparent;
  }
  .star svg {
    width: 64%;
    height: 64%;
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

  .opts {
    display: flex;
    flex-direction: column;
    gap: var(--sp-2);
  }
  label {
    display: flex;
    align-items: center;
    padding: 14px 16px;
    border-radius: var(--radius-button);
    border: 1px solid var(--hairline);
    background: var(--surface-raised);
    font-size: var(--step-15);
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
  label:has(input:focus-visible) {
    outline: 2px solid var(--amber);
    outline-offset: 2px;
  }

  .nav {
    display: flex;
    align-items: center;
    gap: var(--sp-2);
  }
  .back {
    padding: 0 var(--sp-3);
    height: 48px;
    color: var(--text-dim);
    font-size: var(--step-15);
  }
  .next {
    flex: 1;
    height: 48px;
    border-radius: var(--radius-button);
    border: 1px solid var(--amber);
    color: var(--amber);
    font-weight: 600;
    font-size: var(--step-15);
  }
  .next:disabled {
    opacity: 0.4;
  }
</style>
