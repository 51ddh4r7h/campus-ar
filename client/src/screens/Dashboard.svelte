<script lang="ts">
  /**
   * Organiser dashboard — the reporting view, on real play.
   *
   * Every figure comes from `computeAnalytics` in @cmh/shared, which reads the
   * splits, sessions and events the game already writes. Nothing here computes
   * a statistic; the client's job is to choose the form and say what it means.
   *
   * Written to be read by someone who has never seen it before. Every panel
   * is a plain question with the answer underneath — how many played, how far
   * they got, where they actually walked, which clues slowed them down, who
   * needs a hand, what went wrong. No statistic appears without a sentence
   * saying what it means, and nothing is called a median or an index.
   *
   * It is behind the admin key. It shows a whole cohort's behaviour — where
   * each person got stuck, who gave up and where — which is the organisers'
   * business and nobody else's.
   */
  import {onMount} from 'svelte'
  import {formatMarquee, type Analytics} from '@cmh/shared'
  import {api, ApiError, type BatchRow} from '../lib/api'
  import {toasts} from '../lib/stores/toast.svelte'
  import StatTile from '../lib/components/charts/StatTile.svelte'
  import Panel from '../lib/components/charts/Panel.svelte'
  import FlintChart from '../lib/components/charts/FlintChart.svelte'

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
  const phone = (d: string): string =>
    d === 'ios' ? 'iPhone / iPad' : d === 'android' ? 'Android' : 'Not recorded'
  const statusWord = (s: string): string =>
    s === 'complete'
      ? 'Finished'
      : s === 'in_progress'
        ? 'Playing'
        : s === 'paused'
          ? 'Paused'
          : s === 'abandoned'
            ? 'Stopped'
            : 'Not started'

  /**
   * Minutes slower (positive) or quicker (negative) than the game expected.
   *
   * Signed on purpose: a bar either side of zero says "slower" and "quicker"
   * on its own, and the underlying ratio that nobody reads never appears.
   */
  const paceSigned = $derived(
    (data?.locations ?? [])
      .filter((l) => l.medianSplitMs !== null && l.medianParMs !== null)
      .map((l) => {
        const minutes = +((l.medianSplitMs! - l.medianParMs!) / 60_000).toFixed(1)
        return {
          location: l.name,
          minutes,
          // Carried as a field so the colour is part of the data rather than
          // something the reader has to infer from which way a bar points.
          pace: minutes > 0 ? 'Slower than expected' : 'Quicker than expected',
        }
      }),
  )

  /** Two measures per place, so one row each rather than one row per place. */
  const stuckGrouped = $derived(
    (data?.locations ?? [])
      .filter((l) => l.hinted.count + l.skipAttempts > 0)
      .flatMap((l) => [
        {location: l.name, kind: 'Asked for a hint', count: l.hinted.count},
        {location: l.name, kind: 'Tried to skip', count: l.skipAttempts},
      ]),
  )

  /** One row per point per series — the long shape a colour encoding needs. */
  const timelineLong = $derived(
    (data?.timeline ?? []).flatMap((b) => [
      {minute: b.minute, people: b.onCourse, group: 'Still playing'},
      {minute: b.minute, people: b.finished, group: 'Finished'},
    ]),
  )

  const hintRows = $derived(
    (data?.hints ?? []).map((h) => ({
      label: h.rung === 'showLocation' ? 'Show location' : h.rung === 'close' ? 'Close' : 'Warm',
      value: h.count,
    })),
  )

  const troubles = $derived([
    ...(data?.abandonReasons ?? []).map((a) => ({
      label:
        a.reason === 'time_limit'
          ? 'Ran out of time'
          : a.reason === 'stale'
            ? 'Left open too long'
            : a.reason === 'batch_closed'
              ? 'Event was closed'
              : 'Chose to stop',
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
        <StatTile
          label="Signed up"
          value={String(data.registered)}
          sub="people who made an account"
        />
        <StatTile
          label="Actually played"
          value={pct(data.activation)}
          sub="{outOf(data.activation)} pressed START"
        />
        <StatTile
          label="Found all five"
          value={pct(data.completion)}
          sub="{outOf(data.completion)} who started"
          tone={data.completion.of > 0 && data.completion.count / data.completion.of >= 0.7 ? 'good' : 'neutral'}
        />
        <StatTile
          label="Typical run"
          value={data.medianFinishMs === null ? '—' : formatMarquee(data.medianFinishMs)}
          sub="middle of the pack, start to finish"
        />
        <StatTile
          label="First find"
          value={mins(data.medianTimeToFirstFindMs)}
          sub="typical time to reach location one"
        />
        <StatTile
          label="Needed no hints"
          value={pct(data.hintFree)}
          sub="{outOf(data.hintFree)} who finished"
        />
      </div>

      <div class="grid" class:stale={loading}>
        <Panel
          wide
          title="How far people got"
          subtitle="Each bar is how many people reached that point. Where the bars suddenly get shorter is where you lost people."
          columns={['Step', 'People', 'Kept from the step before']}
          rows={data.funnel.map((f) => [f.label, String(f.count), `${Math.round(f.retentionOfPrevious * 100)}%`])}
        >
          <FlintChart
            data={data.funnel.map((f) => ({step: f.label, people: f.count}))}
            semanticTypes={{step: 'Category', people: 'Quantity'}}
            chartType="Bar Chart"
            encodings={{x: {field: 'people'}, y: {field: 'step'}}}
            height={280}
            label="How many people reached each step of the hunt"
          />
        </Panel>

        <Panel
          wide
          title="Which locations took longer than expected"
          subtitle="The game budgets a time for each walk. Red means people took longer than that — the clue is probably too hard, or the walk is longer than it looks."
          columns={['Location', 'Typical time', 'Expected', 'Difference', 'Reached it']}
          rows={data.locations.map((l) => [
            l.name,
            mins(l.medianSplitMs),
            mins(l.medianParMs),
            l.medianSplitMs === null || l.medianParMs === null
              ? '—'
              : `${l.medianSplitMs - l.medianParMs > 0 ? '+' : ''}${((l.medianSplitMs - l.medianParMs) / 60_000).toFixed(1)} min`,
            `${l.found} of ${l.assigned}`,
          ])}
        >
          {#if paceSigned.length === 0}
            <p class="empty">Nobody has reached a location yet.</p>
          {:else}
            <FlintChart
              data={paceSigned}
              semanticTypes={{location: 'Category', minutes: 'Quantity', pace: 'Category'}}
              chartType="Bar Chart"
              encodings={{x: {field: 'minutes'}, y: {field: 'location'}, color: {field: 'pace'}}}
              height={300}
              label="Minutes slower or quicker than expected, by location"
            />
          {/if}
        </Panel>

        <Panel
          wide
          title="Where people actually went"
          subtitle="How many people stood at each location. A place nobody reached is either too hard to find or too far to walk to."
          columns={['Location', 'People who got there', 'Sent but never arrived']}
          rows={data.visits.map((v) => [v.name, String(v.visits), String(v.missed)])}
        >
          {#if data.visits.length === 0}
            <p class="empty">Nobody has reached a location yet.</p>
          {:else}
            <FlintChart
              data={data.visits.map((v) => ({location: v.name, people: v.visits}))}
              semanticTypes={{location: 'Category', people: 'Quantity'}}
              chartType="Bar Chart"
              encodings={{x: {field: 'people'}, y: {field: 'location'}}}
              height={300}
              label="How many people reached each location"
            />
          {/if}
        </Panel>

        <Panel
          title="Where people got stuck"
          subtitle="Hints asked for, and attempts to move on without finding the place"
          columns={['Location', 'Asked for a hint', 'Tried to skip', 'Gave up here']}
          rows={data.locations.map((l) => [
            l.name,
            `${l.hinted.count} of ${l.hinted.of}`,
            String(l.skipAttempts),
            String(l.abandonedHere),
          ])}
        >
          {#if stuckGrouped.length === 0}
            <p class="empty">Nobody has needed help.</p>
          {:else}
            <FlintChart
              data={stuckGrouped}
              semanticTypes={{location: 'Category', kind: 'Category', count: 'Quantity'}}
              chartType="Grouped Bar Chart"
              encodings={{x: {field: 'count'}, y: {field: 'location'}, color: {field: 'kind'}}}
              height={300}
              label="Hints asked for and skips attempted, by location"
            />
          {/if}
        </Panel>

        <Panel
          title="How much help people needed"
          subtitle="Hints get more revealing in order. A lot of the last kind means a clue is not landing."
          columns={['Kind of hint', 'Times used']}
          rows={data.hints.map((h) => [h.rung, String(h.count)])}
        >
          {#if hintRows.length === 0}
            <p class="empty">No hints taken.</p>
          {:else}
            <FlintChart
              data={hintRows.map((h) => ({kind: h.label, times: h.value}))}
              semanticTypes={{kind: 'Category', times: 'Quantity'}}
              chartType="Bar Chart"
              encodings={{x: {field: 'times'}, y: {field: 'kind'}}}
              height={180}
              label="How many times each kind of hint was used"
            />
          {/if}
        </Panel>

        <Panel
          title="What people played on"
          subtitle="Recorded once when they sign in. Useful for knowing which phone to test on next time."
          columns={['Phone', 'People']}
          rows={data.devices.map((d) => [phone(d.device), String(d.count)])}
        >
          {#if data.devices.length === 0}
            <p class="empty">Nothing recorded yet.</p>
          {:else}
            <FlintChart
              data={data.devices.map((d) => ({phone: phone(d.device), people: d.count}))}
              semanticTypes={{phone: 'Category', people: 'Quantity'}}
              chartType="Donut Chart"
              encodings={{theta: {field: 'people'}, color: {field: 'phone'}}}
              height={220}
              label="Share of players on each kind of phone"
            />
          {/if}
        </Panel>

        <Panel
          wide
          plain
          title="Everyone, one row each"
          subtitle="The whole cohort, furthest along first. This is the panel to open when somebody puts their hand up."
          columns={[]}
          rows={[]}
        >
          <div class="roster">
            <table>
              <thead>
                <tr>
                  <th>Player</th><th>Roll</th><th>Phone</th><th>Status</th>
                  <th class="num">Found</th><th class="num">Time</th><th class="num">Hints</th>
                </tr>
              </thead>
              <tbody>
                {#each data.players as p (p.playerId)}
                  <tr>
                    <td>{p.name}</td>
                    <td class="num">{p.rosterId}</td>
                    <td>{phone(p.device)}</td>
                    <td>{statusWord(p.status)}</td>
                    <td class="num">{p.found} of 5</td>
                    <td class="num">{p.elapsedMs === 0 ? '—' : formatMarquee(p.elapsedMs)}</td>
                    <td class="num">{p.hintsTaken}</td>
                  </tr>
                {/each}
              </tbody>
            </table>
          </div>
        </Panel>

        <Panel
          wide
          title="How busy it was, minute by minute"
          subtitle="Blue is people still out walking; orange is people who had finished. The peak is when you need the most staff."
          columns={['Minutes in', 'Still playing', 'Finished']}
          rows={data.timeline.map((b) => [`+${b.minute}`, String(b.onCourse), String(b.finished)])}
        >
          <FlintChart
            data={timelineLong}
            semanticTypes={{minute: 'Quantity', people: 'Quantity', group: 'Category'}}
            chartType="Line Chart"
            encodings={{x: {field: 'minute'}, y: {field: 'people'}, color: {field: 'group'}}}
            height={260}
            label="Players still playing and players finished, by minutes since the first start"
          />
        </Panel>

        {#if troubles.length > 0}
          <Panel
            wide
            title="Problems worth knowing about"
            subtitle="Runs that ended early, arrivals the server would not accept, and replays that cost people time"
            columns={['Kind', 'Count']}
            rows={troubles.map((t) => [t.label, String(t.value)])}
          >
            <FlintChart
              data={troubles.map((t) => ({kind: t.label, count: t.value}))}
              semanticTypes={{kind: 'Category', count: 'Quantity'}}
              chartType="Bar Chart"
              encodings={{x: {field: 'count'}, y: {field: 'kind'}}}
              height={200}
              label="Problems recorded during the event"
            />
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
  .roster {
    overflow-x: auto;
  }
  .roster table {
    width: 100%;
    border-collapse: collapse;
    font-size: var(--step-13);
  }
  .roster th,
  .roster td {
    padding: 7px 12px 7px 0;
    text-align: left;
    white-space: nowrap;
    border-bottom: 1px solid var(--hairline);
  }
  .roster th {
    color: var(--text-faint);
    font-weight: 500;
  }
  .roster td {
    color: var(--text-dim);
  }
  .roster .num {
    font-variant-numeric: tabular-nums;
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
