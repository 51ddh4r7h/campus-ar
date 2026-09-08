<script lang="ts">
  /**
   * Organiser dashboard — the reporting view, on real play.
   *
   * Every figure comes from `computeAnalytics` in @cmh/shared, which reads the
   * splits, sessions and events the game already writes. Nothing here computes
   * a statistic; the client's job is to choose the form and say what it means.
   *
   * The screen is arranged by the decision it supports, not by what is easy to
   * chart. Did they finish (funnel) · was it the right length (par index) · is
   * anyone stuck (hints and skips) · did we staff it right (concurrency) · did
   * anything go wrong (abandonment, speed flags).
   *
   * It is behind the admin key. It shows a whole cohort's behaviour — where
   * each person got stuck, who gave up and where — which is the organisers'
   * business and nobody else's.
   */
  import {onMount} from 'svelte'
  import {formatMarquee, formatScore, type Analytics} from '@cmh/shared'
  import {api, ApiError, type BatchRow} from '../lib/api'
  import {toasts} from '../lib/stores/toast.svelte'
  import StatTile from '../lib/components/charts/StatTile.svelte'
  import Panel from '../lib/components/charts/Panel.svelte'
  import TimeArea from '../lib/components/charts/TimeArea.svelte'
  import RankedBars from '../lib/components/charts/RankedBars.svelte'
  import DivergingBars from '../lib/components/charts/DivergingBars.svelte'

  /** Shared with the console: one key unlocks both surfaces on this device. */
  const KEY_STORE = 'cmh.adminKey'

  let adminKey = $state('')
  let unlocked = $state(false)
  let unlocking = $state(false)
  let batches = $state<BatchRow[]>([])
  let batchId = $state('')
  let data = $state<Analytics | null>(null)
  let loading = $state(false)

  const selected = $derived(batches.find((b) => b.id === batchId) ?? null)

  async function unlock(): Promise<void> {
    if (!adminKey.trim() || unlocking) return
    unlocking = true
    try {
      const key = adminKey.trim()
      batches = (await api.listBatches(key)).batches
      adminKey = key
      unlocked = true
      localStorage.setItem(KEY_STORE, key)
      if (batches[0]) await select(batches[0].id)
    } catch (err) {
      toasts.show(err instanceof ApiError ? err.message : 'Could not unlock reporting', 'alert')
    } finally {
      unlocking = false
    }
  }

  async function select(id: string): Promise<void> {
    batchId = id
    loading = true
    try {
      data = await api.analytics(id, adminKey)
    } catch (err) {
      toasts.show(err instanceof ApiError ? err.message : 'Could not load the report', 'alert')
    } finally {
      loading = false
    }
  }

  onMount(() => {
    const saved = localStorage.getItem(KEY_STORE)
    if (saved) {
      adminKey = saved
      void unlock()
    }
  })

  // ---- presentation helpers -------------------------------------------------

  const pct = (r: {count: number; of: number}): string =>
    r.of === 0 ? '—' : `${Math.round((r.count / r.of) * 100)}%`
  const outOf = (r: {count: number; of: number}): string => `${r.count} of ${r.of}`
  const mins = (ms: number | null): string => (ms === null ? '—' : `${(ms / 60_000).toFixed(1)} min`)

  const funnelRows = $derived(
    (data?.funnel ?? []).map((f) => ({
      label: f.label,
      value: f.count,
      sub: `${Math.round(f.retentionOfPrevious * 100)}% of the step before`,
    })),
  )

  /**
   * Each leg against the time it was budgeted, as a percentage either side.
   *
   * The index is the median split over the median par, so 1.0 is exactly on
   * budget. Plotted as a distance from that, because what an organiser needs
   * is not the ratio but which way and by how much — a leg 40% over is a clue
   * to rewrite, one 40% under is par set too generously.
   */
  const parRows = $derived(
    (data?.locations ?? [])
      .filter((l) => l.parIndex !== null)
      .map((l) => {
        const off = Math.round((l.parIndex! - 1) * 100)
        // SAFETY: the three branches below produce exactly the three members
        // of the union, so the assertion narrows rather than widens.
        const side = (off > 4 ? 'over' : off < -4 ? 'under' : 'level') as 'over' | 'under' | 'level'
        return {
          label: l.name,
          value: Math.abs(off),
          side,
          sub: `${off > 0 ? '+' : ''}${off}% against par · ${l.found} of ${l.assigned} found it`,
        }
      }),
  )

  const stuckRows = $derived(
    (data?.locations ?? [])
      .map((l) => ({
        label: l.name,
        value: l.hinted.count + l.skipAttempts,
        sub: `${l.hinted.count} took a hint, ${l.skipAttempts} tried to skip`,
      }))
      .filter((r) => r.value > 0)
      .sort((a, b) => b.value - a.value),
  )

  const hintRows = $derived(
    (data?.hints ?? []).map((h) => ({
      label: h.rung === 'showLocation' ? 'Show location' : h.rung === 'close' ? 'Close' : 'Warm',
      value: h.count,
    })),
  )

  const timelineSeries = $derived([
    {
      name: 'On course',
      colour: '#3987e5',
      points: (data?.timeline ?? []).map((b) => ({x: b.minute, y: b.onCourse})),
    },
    {
      name: 'Finished',
      colour: '#d95926',
      points: (data?.timeline ?? []).map((b) => ({x: b.minute, y: b.finished})),
    },
  ])

  const troubles = $derived([
    ...(data?.abandonReasons ?? []).map((a) => ({
      label: a.reason === 'stale' ? 'Timed out' : a.reason === 'batch_closed' ? 'Event closed' : 'Player stopped',
      value: a.count,
    })),
    ...(data && data.speedFlags > 0 ? [{label: 'Impossible arrival', value: data.speedFlags}] : []),
    ...(data && data.chargedViews > 0 ? [{label: 'Paid-for replays', value: data.chargedViews}] : []),
  ])
</script>

<main>
  {#if !unlocked}
    <form class="gate" onsubmit={(e) => (e.preventDefault(), void unlock())}>
      <span class="eyebrow">Campus Movie Hunt</span>
      <h1>Reporting</h1>
      <p>This shows how a whole cohort played. It needs the deployment key.</p>
      <label class="sr-only" for="key">Admin key</label>
      <input id="key" type="password" autocomplete="off" bind:value={adminKey} placeholder="Enter deployment key…" />
      <button class="primary" type="submit" disabled={unlocking || !adminKey.trim()}>
        {unlocking ? 'Checking…' : 'Open Reporting'}
      </button>
    </form>
  {:else}
    <header class="top">
      <div>
        <span class="eyebrow">Campus Movie Hunt</span>
        <h1>Event reporting</h1>
      </div>
      <label class="filter">
        <span>Cohort</span>
        <select value={batchId} onchange={(e) => void select(e.currentTarget.value)}>
          {#each batches as b (b.id)}<option value={b.id}>{b.name}</option>{/each}
        </select>
      </label>
    </header>

    {#if !data}
      <p class="empty">{loading ? 'Reading the event…' : 'No report yet.'}</p>
    {:else if data.started === 0}
      <p class="empty">
        Nobody has started <b>{selected?.name ?? 'this event'}</b> yet. The report fills in as they play.
      </p>
    {:else}
      <div class="tiles" class:stale={loading}>
        <StatTile label="Started" value={pct(data.activation)} sub="{outOf(data.activation)} registered" />
        <StatTile
          label="Finished all five"
          value={pct(data.completion)}
          sub="{outOf(data.completion)} who started"
          tone={data.completion.of > 0 && data.completion.count / data.completion.of >= 0.7 ? 'good' : 'neutral'}
        />
        <StatTile
          label="Median vs par"
          value={data.medianScoreMs === null ? '—' : formatScore(data.medianScoreMs)}
          sub={data.medianFinishMs === null ? 'no finishers yet' : `median run ${formatMarquee(data.medianFinishMs)}`}
          tone={data.medianScoreMs !== null && data.medianScoreMs <= 0 ? 'good' : 'bad'}
        />
        <StatTile
          label="Time to first find"
          value={mins(data.medianTimeToFirstFindMs)}
          sub="median, from the start line"
        />
        <StatTile
          label="Finished hint-free"
          value={pct(data.hintFree)}
          sub="{outOf(data.hintFree)} finishers"
        />
      </div>

      <div class="grid" class:stale={loading}>
        <Panel
          wide
          title="Where the cohort got to"
          subtitle="Each step as a share of the one before — the drop names where they were lost"
          columns={['Step', 'Players', 'Of previous step']}
          rows={data.funnel.map((f) => [f.label, String(f.count), `${Math.round(f.retentionOfPrevious * 100)}%`])}
        >
          <RankedBars rows={funnelRows} colour="#3987e5" labelWidth={92} />
        </Panel>

        <Panel
          wide
          title="Each leg against its par"
          subtitle="Median time to reach a place, against the time it was budgeted. Over means the clue is playing hard."
          columns={['Location', 'Median', 'Par', 'Against par', 'Found']}
          rows={data.locations.map((l) => [
            l.name,
            mins(l.medianSplitMs),
            mins(l.medianParMs),
            l.parIndex === null ? '—' : `${l.parIndex > 1 ? '+' : ''}${Math.round((l.parIndex - 1) * 100)}%`,
            `${l.found} of ${l.assigned}`,
          ])}
        >
          {#if parRows.length === 0}
            <p class="empty">Nobody has reached a location yet.</p>
          {:else}
            <DivergingBars rows={parRows} labelWidth={152} />
          {/if}
        </Panel>

        <Panel
          title="Where players get stuck"
          subtitle="Hints taken and skips attempted, by place"
          columns={['Location', 'Hints', 'Skip attempts', 'Gave up here']}
          rows={data.locations.map((l) => [
            l.name,
            `${l.hinted.count} of ${l.hinted.of}`,
            String(l.skipAttempts),
            String(l.abandonedHere),
          ])}
        >
          {#if stuckRows.length === 0}
            <p class="empty">Nobody has needed help.</p>
          {:else}
            <RankedBars rows={stuckRows} colour="#c98500" labelWidth={152} emphasise={3} />
          {/if}
        </Panel>

        <Panel
          title="Which rung of the ladder"
          subtitle="Hints are progressive; a jump to the last rung means the clue did not land"
          columns={['Rung', 'Times taken']}
          rows={data.hints.map((h) => [h.rung, String(h.count)])}
        >
          {#if hintRows.length === 0}
            <p class="empty">No hints taken.</p>
          {:else}
            <RankedBars rows={hintRows} colour="#c98500" labelWidth={112} />
          {/if}
        </Panel>

        <Panel
          wide
          title="Through the event"
          subtitle="How many were out walking, and how many had finished"
          columns={['Minutes in', 'On course', 'Finished']}
          rows={data.timeline.map((b) => [`+${b.minute}`, String(b.onCourse), String(b.finished)])}
        >
          <TimeArea
            series={timelineSeries}
            labelFor={(x) => `+${x}m`}
            label="Players on course and players finished, by minutes since the first start"
          />
        </Panel>

        {#if troubles.length > 0}
          <Panel
            wide
            title="What went wrong"
            subtitle="Hunts that ended early, arrivals the server refused, and replays that cost time"
            columns={['Kind', 'Count']}
            rows={troubles.map((t) => [t.label, String(t.value)])}
          >
            <RankedBars rows={troubles} colour="#e66767" labelWidth={172} />
          </Panel>
        {/if}
      </div>

      <p class="footnote">
        Read from {data.registered} registered {data.registered === 1 ? 'player' : 'players'} ·
        {new Date(data.generatedAtMs).toLocaleTimeString()}
      </p>
    {/if}
  {/if}
</main>

<style>
  main {
    min-height: 100dvh;
    max-width: 1180px;
    margin: 0 auto;
    padding: calc(var(--safe-top) + var(--sp-6)) var(--edge) calc(var(--safe-bottom) + var(--sp-12));
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    gap: var(--sp-4);
    align-content: start;
  }
  .gate {
    display: grid;
    gap: var(--sp-2);
    width: min(100%, 420px);
    margin: 12dvh auto 0;
  }
  .gate p {
    margin: 0 0 var(--sp-2);
    color: var(--text-dim);
  }
  .gate input {
    width: 100%;
    padding: 11px 12px;
    border: 1px solid var(--hairline);
    border-radius: 10px;
    background: rgba(0, 0, 0, 0.26);
    color: var(--text);
    font: inherit;
  }
  .gate button {
    margin-top: var(--sp-2);
    padding: 12px;
    border-radius: var(--radius-button);
    background: var(--amber);
    color: var(--amber-ink);
    font-weight: 600;
  }
  .gate button:disabled {
    cursor: not-allowed;
    opacity: 0.52;
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
    font-size: var(--step-13);
    font-weight: 500;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: var(--amber);
  }
  /* Geist alone here too: this is a reporting tool, not a title card. */
  h1 {
    margin: var(--sp-1) 0 0;
    font-weight: 600;
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
    max-width: min(60vw, 320px);
    padding: 8px 10px;
    border-radius: 10px;
    border: 1px solid var(--hairline);
    background: var(--surface-raised);
    color: var(--text);
    font: inherit;
    font-size: var(--step-15);
  }
  .tiles,
  .grid {
    display: grid;
    gap: var(--sp-3);
    /* Held at reduced opacity while refetching rather than replaced by a
       skeleton — the numbers stay readable and nothing jumps. */
    transition: opacity var(--dur-standard) ease;
  }
  .tiles {
    grid-template-columns: repeat(auto-fit, minmax(168px, 1fr));
  }
  .grid {
    grid-template-columns: repeat(auto-fit, minmax(320px, 1fr));
  }
  .stale {
    opacity: 0.55;
  }
  .empty {
    margin: 0;
    padding: var(--sp-6) 0;
    text-align: center;
    color: var(--text-dim);
  }
  .footnote {
    margin: 0;
    color: var(--text-faint);
    font-size: var(--step-13);
  }
  .sr-only {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip: rect(0, 0, 0, 0);
    white-space: nowrap;
  }
</style>
