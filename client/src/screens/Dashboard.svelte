<script lang="ts">
  /**
   * Organiser dashboard — a mock.
   *
   * Every figure on this screen is generated in `lib/dashboard-mock.ts`. It
   * exists to settle the shape of the thing before any of it is wired to the
   * database: which questions the board answers, in what order, and how much
   * room each one needs. The banner says so on screen, because a dashboard
   * that looks real and is not is the most misleading artefact there is.
   *
   * Charts follow the house data-viz rules: one measure per axis, categorical
   * hues assigned in a fixed order and validated against this surface, thin
   * marks, a legend wherever two series share a plot, and a table twin on
   * every panel so no value is reachable only by hovering.
   */
  import {formatMarquee} from '@cmh/shared'
  import {COHORTS, clockLabel, type Cohort} from '../lib/dashboard-mock'
  import StatTile from '../lib/components/charts/StatTile.svelte'
  import Panel from '../lib/components/charts/Panel.svelte'
  import TimeArea from '../lib/components/charts/TimeArea.svelte'
  import RankedBars from '../lib/components/charts/RankedBars.svelte'
  import DivergingBars from '../lib/components/charts/DivergingBars.svelte'

  let cohortId = $state(COHORTS[0]!.id)
  const d: Cohort = $derived(COHORTS.find((c) => c.id === cohortId) ?? COHORTS[0]!)

  const pct = (n: number) => `${Math.round(n * 100)}%`
  const signed = (ms: number) =>
    `${ms <= 0 ? '−' : '+'}${formatMarquee(Math.abs(ms))}`
</script>

<main>
  <header class="top">
    <div>
      <span class="eyebrow">Campus Movie Hunt</span>
      <h1>Event dashboard</h1>
    </div>
    <!-- One filter row, above everything it scopes; every panel re-renders. -->
    <label class="filter">
      <span>Cohort</span>
      <select bind:value={cohortId}>
        {#each COHORTS as c (c.id)}<option value={c.id}>{c.name}</option>{/each}
      </select>
    </label>
  </header>

  <p class="mock" role="status">
    <b>Sample data.</b> Nothing on this page comes from a real event — it is a mock
    of the reporting view, so the layout can be reviewed before it is wired up.
  </p>

  <div class="tiles">
    <StatTile label="Players registered" value={String(d.players)} sub={d.name} />
    <StatTile label="On course now" value={String(d.onCourse)} sub="walking between scenes" />
    <StatTile
      label="Completion rate"
      value={pct(d.completionRate)}
      sub="{d.finished} finished the hunt"
      tone={d.completionRate >= 0.7 ? 'good' : 'neutral'}
    />
    <StatTile
      label="Median finish vs par"
      value={signed(d.medianVsParMs)}
      sub="median run {formatMarquee(d.medianFinishMs)}"
      tone={d.medianVsParMs <= 0 ? 'good' : 'bad'}
    />
  </div>

  <div class="grid">
    <Panel
      wide
      title="Through the morning"
      subtitle="How many are out walking, and how many have finished"
      columns={['Time', 'On course', 'Finished']}
      rows={d.activity[0]!.points.map((p, i) => [
        clockLabel(p.x),
        String(p.y),
        String(d.activity[1]!.points[i]!.y),
      ])}
    >
      <TimeArea series={d.activity} />
    </Panel>

    <Panel
      title="How far players got"
      subtitle="Players reaching each level"
      columns={['Level', 'Players', 'Share of starters']}
      rows={d.funnel.map((r) => [r.label, String(r.value), r.sub ?? ''])}
    >
      <RankedBars rows={d.funnel} colour="#3987e5" labelWidth={72} />
    </Panel>

    <Panel
      title="Finishers against par"
      subtitle="Margin at the finish line"
      columns={['Band', 'Finishers', 'Side']}
      rows={d.vsPar.map((r) => [r.label, String(r.value), r.sub ?? ''])}
    >
      <DivergingBars rows={d.vsPar} />
    </Panel>

    <Panel
      wide
      title="Time spent reaching each location"
      subtitle="Median minutes on the leg that ends there — the three slowest are where a clue is hardest"
      columns={['Location', 'Median minutes', 'Organiser marking']}
      rows={d.legTimes.map((r) => [r.label, r.value.toFixed(1), r.sub ?? ''])}
    >
      <RankedBars
        rows={d.legTimes}
        colour="#d95926"
        format={(v) => `${v.toFixed(1)} min`}
        labelWidth={152}
        emphasise={3}
      />
    </Panel>
  </div>
</main>

<style>
  main {
    min-height: 100dvh;
    max-width: 1080px;
    margin: 0 auto;
    padding: calc(var(--safe-top) + var(--sp-6)) var(--edge) calc(var(--safe-bottom) + var(--sp-12));
    display: flex;
    flex-direction: column;
    gap: var(--sp-4);
  }
  .top {
    display: flex;
    align-items: flex-end;
    justify-content: space-between;
    gap: var(--sp-4);
    flex-wrap: wrap;
  }
  .eyebrow {
    display: block;
    font-family: var(--font-mono);
    font-size: var(--step-13);
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: var(--amber);
  }
  h1 {
    margin: var(--sp-1) 0 0;
    font-family: var(--font-display);
    font-weight: 400;
    font-size: clamp(1.8rem, 6vw, 2.4rem);
    line-height: 1;
  }
  .filter {
    display: flex;
    align-items: center;
    gap: var(--sp-2);
    font-size: var(--step-13);
    color: var(--text-faint);
  }
  .filter select {
    padding: 8px 10px;
    border-radius: 10px;
    border: 1px solid var(--hairline);
    background: var(--surface-raised);
    color: var(--text);
    font: inherit;
    font-size: var(--step-15);
  }
  .mock {
    margin: 0;
    padding: 10px var(--sp-4);
    border-radius: 12px;
    border: 1px solid rgba(232, 165, 76, 0.35);
    background: rgba(232, 165, 76, 0.08);
    color: var(--text-dim);
    font-size: var(--step-13);
  }
  .mock b {
    color: var(--amber);
  }
  .tiles,
  .grid {
    display: grid;
    gap: var(--sp-3);
  }
  .tiles {
    grid-template-columns: repeat(auto-fit, minmax(190px, 1fr));
  }
  .grid {
    grid-template-columns: repeat(auto-fit, minmax(320px, 1fr));
  }
</style>
