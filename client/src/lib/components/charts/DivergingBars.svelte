<script lang="ts">
  /**
   * Polarity: how many finishers came in under par, and how many over.
   *
   * Two hues either side of a neutral zero, which is the one case where two
   * colours on one measure is right. The pair sits in the CVD warning band, so
   * it never carries the meaning alone — the side of the axis and a signed
   * label both say it too.
   */
  import type {Row} from '../../dashboard-mock'
  import {barPath} from './geometry'

  interface Props {
    rows: readonly Row[]
    labelWidth?: number
  }
  const {rows, labelWidth = 132}: Props = $props()

  const UNDER = '#199e70'
  const OVER = '#e66767'
  const NEUTRAL = 'rgba(245, 243, 236, 0.28)'

  const BAND = 30
  const BAR = 16

  let w = $state(0)
  const height = $derived(rows.length * BAND + 8)
  const plotW = $derived(Math.max(0, w - labelWidth - 46))
  const half = $derived(plotW / 2)
  const zero = $derived(labelWidth + half)
  const max = $derived(Math.max(1, ...rows.map((r) => r.value)))

  let hover = $state<number | null>(null)
</script>

<div class="wrap" bind:clientWidth={w}>
  <ul class="legend">
    <li><span class="key" style="background: {UNDER}"></span>Under par</li>
    <li><span class="key" style="background: {NEUTRAL}"></span>Level</li>
    <li><span class="key" style="background: {OVER}"></span>Over par</li>
  </ul>

  {#if w > 0}
    <svg {height} width={w} role="img" aria-label="Finishers by margin against par">
      <line class="zero" x1={zero} x2={zero} y1="0" y2={height} />
      {#each rows as r, i (r.label)}
        {@const n = r.value}
        {@const bw = Math.max(2, (n / max) * half * 0.94)}
        {@const y = i * BAND + 4}
        {@const under = r.side === 'under'}
        <rect
          class="hit"
          role="presentation"
          x="0"
          {y}
          width={Math.max(w, 1)}
          height={BAND}
          onpointerenter={() => (hover = i)}
          onpointerleave={() => (hover = null)}
        />
        <text class="label" x="0" y={y + BAR / 2 + 4} class:on={hover === i}>{r.label}</text>
        {#if r.side === 'level'}
          <path d={barPath(zero - bw / 2, y + (BAND - BAR) / 2 - 4, bw, BAR, 'right')} fill={NEUTRAL} />
        {:else}
          <path
            d={barPath(
              under ? zero - bw - 2 : zero + 2,
              y + (BAND - BAR) / 2 - 4,
              bw,
              BAR,
              under ? 'left' : 'right',
            )}
            fill={under ? UNDER : OVER}
            opacity={hover === null || hover === i ? 1 : 0.55}
          />
        {/if}
        <!-- The side is said three ways — position, hue, and this word — because
             the pair sits in the CVD warning band and must not carry it alone. -->
        <text
          class="value"
          x={under ? zero - bw - 10 : r.side === 'level' ? zero + bw / 2 + 10 : zero + bw + 10}
          text-anchor={under ? 'end' : 'start'}
          y={y + BAR / 2 + 4}
        >
          {n}
        </text>
      {/each}
    </svg>
  {/if}
</div>

<style>
  .wrap {
    min-width: 0;
  }
  .legend {
    display: flex;
    gap: var(--sp-4);
    list-style: none;
    margin: 0 0 var(--sp-2);
    padding: 0;
    font-size: var(--step-13);
    color: var(--text-dim);
  }
  .legend li {
    display: flex;
    align-items: center;
    gap: 6px;
  }
  .key {
    width: 10px;
    height: 10px;
    border-radius: 3px;
  }
  svg {
    display: block;
  }
  .hit {
    fill: transparent;
  }
  .zero {
    stroke: var(--hairline);
    stroke-width: 1;
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
</style>
