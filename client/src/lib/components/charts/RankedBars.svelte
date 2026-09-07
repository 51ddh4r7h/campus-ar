<script lang="ts">
  /**
   * Magnitude across a handful of named things — one series, so one colour.
   *
   * Horizontal because the labels are place names, and a place name turned on
   * its side is unreadable. The value rides the tip of its own bar, so the
   * tooltip enhances rather than gates.
   */
  import type {Row} from '../../dashboard-mock'
  import {barPath} from './geometry'

  interface Props {
    rows: readonly Row[]
    colour?: string
    /** Rendered at the bar tip and in the tooltip. */
    format?: (v: number) => string
    labelWidth?: number
    /**
     * Colour the first N rows and mute the rest.
     *
     * Nine bars in one hue is a wall; when the panel is about the slowest few,
     * emphasis says so far better than nine identical marks and a reader left
     * to compare lengths.
     */
    emphasise?: number
  }
  const {
    rows,
    colour = '#3987e5',
    format = (v: number) => String(v),
    labelWidth = 132,
    emphasise = 0,
  }: Props = $props()

  const BAND = 30
  const BAR = 16 // <= 24px; the leftover in the band is deliberate air
  const PAD_RIGHT = 54

  let w = $state(0)
  const height = $derived(rows.length * BAND + 8)
  const plotW = $derived(Math.max(0, w - labelWidth - PAD_RIGHT))
  const max = $derived(Math.max(1, ...rows.map((r) => r.value)))

  const MUTED = 'rgba(245, 243, 236, 0.24)'
  const fill = (i: number): string => (emphasise === 0 || i < emphasise ? colour : MUTED)

  let hover = $state<number | null>(null)
</script>

<div class="wrap" bind:clientWidth={w}>
  {#if w > 0}
    <svg {height} width={w} role="img" aria-label="Ranked values by name">
      {#each rows as r, i (r.label)}
        {@const bw = (r.value / max) * plotW}
        {@const y = i * BAND + 4}
        <!-- Hit target spans the whole band, well past the 24px minimum. -->
        <rect
          class="hit"
          x="0"
          {y}
          width={Math.max(w, 1)}
          height={BAND}
          onpointerenter={() => (hover = i)}
          onpointerleave={() => (hover = null)}
        />
        <text class="label" x="0" y={y + BAR / 2 + 4} class:on={hover === i}>{r.label}</text>
        <path
          d={barPath(labelWidth, y + (BAND - BAR) / 2 - 4, Math.max(2, bw), BAR, 'right')}
          fill={fill(i)}
          opacity={hover === null || hover === i ? 1 : 0.55}
        />
        <text class="value" x={labelWidth + Math.max(2, bw) + 8} y={y + BAR / 2 + 4}>
          {format(r.value)}
        </text>
      {/each}
    </svg>

    {#if hover !== null && rows[hover]?.sub}
      <p class="note"><b>{rows[hover]!.label}</b> — {rows[hover]!.sub}</p>
    {/if}
  {/if}
</div>

<style>
  .wrap {
    position: relative;
    min-width: 0;
  }
  svg {
    display: block;
  }
  .hit {
    fill: transparent;
  }
  .label {
    fill: var(--text-dim);
    font-size: 12px;
  }
  .label.on {
    fill: var(--text);
  }
  .value {
    fill: var(--text-faint);
    font-size: 11px;
    font-family: var(--font-mono);
    font-variant-numeric: tabular-nums;
  }
  .note {
    margin: var(--sp-2) 0 0;
    font-size: var(--step-13);
    color: var(--text-faint);
  }
  .note b {
    color: var(--text-dim);
    font-weight: 600;
  }
</style>
