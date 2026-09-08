<script lang="ts">
  /**
   * Two series over the morning: how many are walking, how many have finished.
   *
   * Change over time, so a line — with a 10% wash beneath it rather than a
   * saturated block. Both series are on the same scale (people), which is what
   * lets them share one axis; a second y-scale is never the answer here.
   */
  import type {Series} from './types'
  import {areaPath, linePath, niceTicks} from './geometry'

  interface Props {
    series: readonly Series[]
    height?: number
    /** How an x value reads on the axis and in the tooltip. */
    labelFor?: (x: number) => string
    /** Named for the screen reader, since the marks carry the meaning. */
    label?: string
  }
  const {
    series,
    height = 220,
    labelFor = (x: number) => String(x),
    label = 'Time series',
  }: Props = $props()

  const PAD = {top: 12, right: 46, bottom: 26, left: 34}
  let w = $state(0)

  const plotW = $derived(Math.max(0, w - PAD.left - PAD.right))
  const plotH = $derived(height - PAD.top - PAD.bottom)

  const xs = $derived(series[0]?.points.map((p) => p.x) ?? [])
  const maxX = $derived(Math.max(1, ...xs))
  const maxY = $derived(Math.max(1, ...series.flatMap((s) => s.points.map((p) => p.y))))
  const ticks = $derived(niceTicks(maxY))
  const top = $derived(ticks[ticks.length - 1] ?? maxY)

  const sx = (x: number): number => PAD.left + (x / maxX) * plotW
  const sy = (y: number): number => PAD.top + plotH - (y / top) * plotH

  /**
   * First, middle and last — deduplicated.
   *
   * A short event has two or three points, where those three positions
   * collide. A keyed `{#each}` over the raw list then throws
   * `each_key_duplicate`, which takes down not just the axis but every panel
   * rendered after this one. A twenty-minute event is exactly the case a
   * reporting screen has to survive.
   */
  const tickIndexes = $derived(
    [...new Set([0, Math.floor((xs.length - 1) / 2), xs.length - 1])].filter(
      (i) => i >= 0 && xs[i] !== undefined,
    ),
  )

  const placed = $derived(
    series.map((s) => ({
      ...s,
      pts: s.points.map((p) => ({x: sx(p.x), y: sy(p.y), raw: p})),
    })),
  )

  /** Nearest sample to the pointer — the crosshair reads a column, not a dot. */
  let hover = $state<number | null>(null)
  function track(e: PointerEvent) {
    // SAFETY: the handler is bound to the <svg> below, so currentTarget is
    // that element for the whole of this call.
    const box = (e.currentTarget as SVGElement).getBoundingClientRect()
    const rel = ((e.clientX - box.left - PAD.left) / plotW) * maxX
    let best = 0
    for (let i = 1; i < xs.length; i++) {
      if (Math.abs(xs[i]! - rel) < Math.abs(xs[best]! - rel)) best = i
    }
    hover = best
  }
</script>

<div class="wrap" bind:clientWidth={w}>
  <ul class="legend">
    {#each series as s (s.name)}
      <li><span class="key" style="background: {s.colour}"></span>{s.name}</li>
    {/each}
  </ul>

  {#if w > 0}
    <svg
      {height}
      width={w}
      role="img"
      aria-label={label}
      onpointermove={track}
      onpointerleave={() => (hover = null)}
    >
      {#each ticks as t (t)}
        <line class="grid" x1={PAD.left} x2={w - PAD.right} y1={sy(t)} y2={sy(t)} />
        <text class="tick" x={PAD.left - 8} y={sy(t) + 4} text-anchor="end">{t}</text>
      {/each}

      {#each tickIndexes as i (i)}
        <text class="tick" x={sx(xs[i]!)} y={height - 8} text-anchor="middle">
          {labelFor(xs[i]!)}
        </text>
      {/each}

      {#each placed as s (s.name)}
        <path d={areaPath(s.pts, PAD.top + plotH)} fill={s.colour} opacity="0.1" />
        <path d={linePath(s.pts)} fill="none" stroke={s.colour} stroke-width="2"
              stroke-linejoin="round" stroke-linecap="round" />
        <!-- One label per series, at the end: the value that is true now. -->
        <text class="endlabel" x={(s.pts[s.pts.length - 1]?.x ?? 0) + 8}
              y={(s.pts[s.pts.length - 1]?.y ?? 0) + 4}>
          {s.points[s.points.length - 1]?.y}
        </text>
      {/each}

      {#if hover !== null}
        <line class="cross" x1={sx(xs[hover]!)} x2={sx(xs[hover]!)} y1={PAD.top} y2={PAD.top + plotH} />
        {#each placed as s (s.name)}
          <circle cx={s.pts[hover]!.x} cy={s.pts[hover]!.y} r="4.5"
                  fill={s.colour} stroke="var(--panel-surface)" stroke-width="2" />
        {/each}
      {/if}
    </svg>

    {#if hover !== null}
      <div class="tip" style="left: {Math.min(Math.max(sx(xs[hover]!), 70), w - 70)}px">
        <strong>{labelFor(xs[hover]!)}</strong>
        {#each series as s (s.name)}
          <span><i style="background: {s.colour}"></i>{s.name} <b>{s.points[hover]!.y}</b></span>
        {/each}
      </div>
    {/if}
  {/if}
</div>

<style>
  .wrap {
    position: relative;
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
    touch-action: none;
  }
  .grid {
    stroke: var(--hairline);
    stroke-width: 1;
  }
  .cross {
    stroke: var(--hairline-bright);
    stroke-width: 1;
  }
  .tick {
    fill: var(--text-faint);
    font-size: 11px;
    font-variant-numeric: tabular-nums;
  }
  .endlabel {
    fill: var(--text-dim);
    font-size: 11px;
  }
  .tip {
    position: absolute;
    top: 6px;
    transform: translateX(-50%);
    display: flex;
    flex-direction: column;
    gap: 3px;
    padding: 8px 10px;
    border-radius: 10px;
    background: var(--surface-raised);
    border: 1px solid var(--hairline);
    backdrop-filter: blur(12px);
    font-size: var(--step-13);
    color: var(--text-dim);
    pointer-events: none;
    white-space: nowrap;
  }
  .tip strong {
    color: var(--text);
  }
  .tip span {
    display: flex;
    align-items: center;
    gap: 6px;
  }
  .tip i {
    width: 8px;
    height: 8px;
    border-radius: 2px;
  }
  .tip b {
    color: var(--text);
  }
</style>
