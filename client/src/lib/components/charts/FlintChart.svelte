<script lang="ts">
  /**
   * A chart drawn by Vega, specified by flint-chart.
   *
   * flint takes a high-level description — this is a Funnel Chart, these are
   * the fields, this one is a Quantity — and works out the encodings, layout
   * and labels. Vega then draws it. Neither of them knows anything about this
   * app, which is why the theme below has to say so explicitly.
   *
   * Only the reporting screen uses this, and that screen is loaded on demand,
   * so none of Vega reaches the phone of anyone actually playing.
   */
  import {assembleVegaLite} from 'flint-chart/vegalite'
  import embed, {type VisualizationSpec} from 'vega-embed'
  import type {Config} from 'vega-lite'

  interface Props {
    /** Rows, already shaped for the chart. */
    data: ReadonlyArray<Record<string, string | number>>
    /** What each field means to flint: Quantity, Category, Time… */
    semanticTypes: Record<string, string>
    chartType: string
    encodings: Record<string, {field: string}>
    height?: number
    /** Named for screen readers, since the marks carry the meaning. */
    label: string
  }

  const {data, semanticTypes, chartType, encodings, height = 260, label}: Props = $props()

  /**
   * The app's palette, told to Vega.
   *
   * Vega ships a light theme with its own blue. These are the same categorical
   * steps the hand-rolled charts used — validated against this dark surface —
   * so a flint chart and the rest of the console agree.
   */
  const THEME: Config = {
    // 'transparent' rather than null: the panel behind it already carries the
    // surface colour, and Vega's own default is white.
    background: 'transparent',
    font: "'Geist Variable', system-ui, sans-serif",
    title: {color: '#f5f3ec', fontSize: 13, fontWeight: 600, anchor: 'start' as const},
    axis: {
      labelColor: '#a3a19b',
      titleColor: '#a3a19b',
      labelFontSize: 11,
      titleFontSize: 11,
      domainColor: '#2f2e2b',
      tickColor: '#2f2e2b',
      gridColor: '#232320',
      gridWidth: 1,
    },
    legend: {labelColor: '#c9c6bd', titleColor: '#a3a19b', labelFontSize: 11, titleFontSize: 11},
    range: {category: ['#3987e5', '#d95926', '#199e70', '#c98500', '#d55181']},
    view: {stroke: null},
  }

  let host = $state<HTMLDivElement | null>(null)

  $effect(() => {
    const el = host
    if (!el) return
    // flint declares its own return as `any`; naming the type here is the one
    // place the shape is pinned, without an assertion to argue with.
    //
    // Assembly throws for a chart type this backend does not carry — the
    // Vega-Lite templates are a different set from the ECharts ones. Inside an
    // effect that throw unmounts the whole screen, so one bad panel would take
    // the dashboard with it. A panel that cannot draw is an empty panel.
    let spec: VisualizationSpec
    try {
      spec = assembleVegaLite({
        data: {values: [...data]},
        semantic_types: semanticTypes,
        chart_spec: {chartType, encodings, baseSize: {width: el.clientWidth || 640, height}},
      })
    } catch {
      el.replaceChildren()
      return
    }

    let cancelled = false
    let view: {finalize(): void} | null = null
    void embed(el, spec, {
      actions: false,
      renderer: 'canvas',
      mode: 'vega-lite',
      config: THEME,
    })
      .then((r) => {
        // The effect can be torn down while embed is still resolving; without
        // this the old view paints over the new one on a cohort change.
        if (cancelled) r.finalize()
        else view = r
      })
      .catch(() => {
        /* a chart that cannot draw is an empty panel, not a broken screen */
      })

    return () => {
      cancelled = true
      view?.finalize()
      el.replaceChildren()
    }
  })
</script>

<div class="chart" role="img" aria-label={label} bind:this={host}></div>

<style>
  .chart {
    width: 100%;
    min-width: 0;
  }
  /* Vega injects its own canvas; keep it from spilling out of the panel. */
  .chart :global(canvas),
  .chart :global(svg) {
    max-width: 100%;
  }
</style>
