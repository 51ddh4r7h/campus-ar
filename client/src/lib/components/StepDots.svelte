<script lang="ts">
  /**
   * Where you are in a short sequence.
   *
   * The permissions screen asks for two things in a row and, until now, gave no
   * sign of that — you granted location and the same screen asked for something
   * else, with no way to tell whether you were nearly through or had just
   * started. Two prompts with no end in sight is where people close the tab.
   *
   * Deliberately dots rather than svelte-bits' Stepper: that component owns the
   * content and the navigation between panels, and this screen's steps are
   * driven by permission callbacks, not by clicking forward. All that was
   * missing was the sense of progress.
   */
  interface Props {
    /** 1-based. */
    current: number
    total: number
    labels?: readonly string[]
  }

  const {current, total, labels}: Props = $props()
</script>

<div class="steps" role="group" aria-label="Step {current} of {total}">
  {#each Array.from({length: total}, (_, i) => i + 1) as n (n)}
    <div class="step" class:done={n < current} class:now={n === current}>
      <span class="bar"></span>
      {#if labels?.[n - 1]}<span class="label">{labels[n - 1]}</span>{/if}
    </div>
  {/each}
</div>

<style>
  .steps {
    display: flex;
    gap: var(--sp-2);
    width: 100%;
  }
  .step {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .bar {
    height: 3px;
    border-radius: 2px;
    background: var(--hairline);
    transition: background var(--dur-standard) var(--ease-spring);
  }
  .done .bar {
    background: var(--success);
  }
  .now .bar {
    background: var(--amber);
  }
  .label {
    font-size: var(--step-13);
    color: var(--text-faint);
    transition: color var(--dur-standard) ease;
  }
  .now .label {
    color: var(--text-dim);
  }
  .done .label {
    color: var(--text-faint);
  }
</style>
