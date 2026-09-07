<script lang="ts">
  /**
   * One number, said plainly.
   *
   * A single value is not a chart — a one-bar bar chart or a two-slice donut
   * would be a worse way to say the same thing. The figure wears the interface
   * sans with proportional digits: a display serif reads as decoration, and
   * tabular figures make a large number look gappy.
   */
  interface Props {
    label: string
    value: string
    sub?: string
    tone?: 'neutral' | 'good' | 'bad'
  }
  const {label, value, sub, tone = 'neutral'}: Props = $props()
</script>

<div class="tile">
  <span class="label">{label}</span>
  <strong class="value {tone}">{value}</strong>
  {#if sub}<span class="sub">{sub}</span>{/if}
</div>

<style>
  .tile {
    display: flex;
    flex-direction: column;
    gap: 2px;
    padding: var(--sp-4);
    border-radius: 16px;
    background: var(--surface);
    border: var(--glass-border);
    min-width: 0;
  }
  .label {
    font-size: var(--step-13);
    color: var(--text-faint);
  }
  .value {
    font-family: var(--font-ui);
    font-size: clamp(1.6rem, 5vw, 2.1rem);
    font-weight: 600;
    line-height: 1.1;
    letter-spacing: -0.02em;
    color: var(--text);
  }
  .value.good {
    color: #7fd1a6;
  }
  .value.bad {
    color: #e66767;
  }
  .sub {
    font-size: var(--step-13);
    color: var(--text-dim);
  }
</style>
