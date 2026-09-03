<script lang="ts">
  /**
   * Organiser console. Everything needed to run a batch: create it, paste a
   * roster, hand out the personal links, and watch the board while it runs.
   *
   * The admin key is typed in here and kept in this browser only — it is never
   * bundled and never sent anywhere but the Worker's own /admin routes.
   */
  import {onMount} from 'svelte'
  import {LEVEL_COUNT, LOCATIONS, formatMarquee} from '@cmh/shared'
  import type {StandingRow} from '@cmh/shared'
  import {api, ApiError, type BatchRow, type RosterEntry} from '../lib/api'
  import {toasts} from '../lib/stores/toast.svelte'

  const KEY_STORE = 'cmh.adminKey'

  let adminKey = $state('')
  let unlocked = $state(false)
  let batches = $state<BatchRow[]>([])
  let selected = $state<BatchRow | null>(null)
  let roster = $state<RosterEntry[]>([])
  let board = $state<StandingRow[]>([])
  let busy = $state(false)

  let newBatchName = $state('')
  let newBatchCode = $state('')
  let rosterText = $state('')

  /** The one link an organiser shares with a whole cohort. */
  const signupLink = (code: string): string => `${window.location.origin}/?e=${encodeURIComponent(code)}`

  async function copySignupLink(code: string) {
    try {
      await navigator.clipboard.writeText(signupLink(code))
      toasts.show('Signup link copied', 'success')
    } catch {
      toasts.show('Clipboard blocked — select and copy manually', 'alert')
    }
  }

  const playerLink = (r: RosterEntry): string =>
    `${window.location.origin}/?t=${encodeURIComponent(r.sessionToken)}&b=${encodeURIComponent(
      selected?.id ?? '',
    )}&n=${encodeURIComponent(r.name)}`

  async function unlock() {
    busy = true
    try {
      batches = (await api.listBatches(adminKey)).batches
      unlocked = true
      localStorage.setItem(KEY_STORE, adminKey)
    } catch (err) {
      toasts.show(err instanceof ApiError ? err.message : 'Could not sign in', 'alert')
    } finally {
      busy = false
    }
  }

  async function refreshBatches() {
    try {
      batches = (await api.listBatches(adminKey)).batches
    } catch (err) {
      toasts.show(err instanceof ApiError ? err.message : 'Could not load batches', 'alert')
    }
  }

  async function createBatch() {
    if (!newBatchName.trim()) return
    busy = true
    try {
      await api.createBatch(newBatchName.trim(), false, adminKey, newBatchCode.trim() || undefined)
      newBatchName = ''
      newBatchCode = ''
      await refreshBatches()
    } catch (err) {
      toasts.show(err instanceof ApiError ? err.message : 'Could not create the batch', 'alert')
    } finally {
      busy = false
    }
  }

  async function open(b: BatchRow) {
    selected = b
    roster = []
    board = []
    await Promise.all([loadRoster(), loadBoard()])
  }

  async function loadRoster() {
    if (!selected) return
    try {
      roster = (await api.roster(selected.id, adminKey)).players
    } catch (err) {
      toasts.show(err instanceof ApiError ? err.message : 'Could not load the roster', 'alert')
    }
  }

  async function loadBoard() {
    if (!selected) return
    try {
      board = (await api.standings(selected.id)).rows
    } catch {
      board = []
    }
  }

  /** One player per line: `Name` or `Name, rosterId`. */
  function parseRoster(text: string): Array<{name: string; rosterId: string}> {
    return text
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.length > 0)
      .map((line, i) => {
        const [name, rosterId] = line.split(',').map((part) => part.trim())
        return {name: name ?? `Player ${i + 1}`, rosterId: rosterId || `r-${Date.now()}-${i}`}
      })
  }

  /**
   * Pin everyone in this registration to one route.
   *
   * For walking the game on site. Routes are normally drawn from the balanced
   * pool, which means a tester standing at the fountain gets sent to the
   * amphitheatre first and has to walk the whole thing to reach the stop they
   * came to check. Naming the five stops in order makes the walk the one you
   * intended. Left empty, everyone gets a real assigned route.
   */
  let pinnedText = $state('')
  const pinned = $derived(
    pinnedText
      .split(/[\s,]+/)
      .map((id) => id.trim())
      .filter((id) => id.length > 0),
  )
  const pinnedValid = $derived(
    pinned.length === 0 ||
      (pinned.length === LEVEL_COUNT &&
        new Set(pinned).size === LEVEL_COUNT &&
        pinned.every((id) => LOCATIONS.some((l) => l.id === id))),
  )

  async function addPlayers() {
    if (!selected || !pinnedValid) return
    const roster = parseRoster(rosterText)
    const players = pinned.length > 0 ? roster.map((p) => ({...p, route: [...pinned]})) : roster
    if (players.length === 0) return
    busy = true
    try {
      await api.registerPlayers(selected.id, players, adminKey)
      rosterText = ''
      await Promise.all([loadRoster(), refreshBatches()])
      toasts.show(`Registered ${players.length}`, 'success')
    } catch (err) {
      toasts.show(err instanceof ApiError ? err.message : 'Could not register those players', 'alert')
    } finally {
      busy = false
    }
  }

  async function copyAllLinks() {
    const text = roster.map((r) => `${r.name}\t${playerLink(r)}`).join('\n')
    try {
      await navigator.clipboard.writeText(text)
      toasts.show('Links copied', 'success')
    } catch {
      toasts.show('Clipboard blocked — select and copy manually', 'alert')
    }
  }

  onMount(() => {
    const saved = localStorage.getItem(KEY_STORE)
    if (saved) {
      adminKey = saved
      void unlock()
    }
    const id = setInterval(() => void loadBoard(), 10_000)
    return () => clearInterval(id)
  })
</script>

<main>
  {#if !unlocked}
    <section class="gate">
      <h1>Organiser console</h1>
      <p class="dim">Enter the admin key for this deployment.</p>
      <input
        type="password"
        bind:value={adminKey}
        placeholder="Admin key"
        onkeydown={(e) => e.key === 'Enter' && void unlock()}
      />
      <button class="primary" disabled={busy} onclick={() => void unlock()}>
        {busy ? 'Checking…' : 'Unlock'}
      </button>
    </section>
  {:else}
    <header>
      <h1>Organiser console</h1>
      <button class="ghost" onclick={() => void refreshBatches()}>Refresh</button>
    </header>

    <section>
      <h2>Batches</h2>
      <div class="row">
        <input bind:value={newBatchName} placeholder="New batch name (e.g. Induction 2026 — Group A)" />
        <button class="primary" disabled={busy || !newBatchName.trim()} onclick={() => void createBatch()}>
          Create
        </button>
      </div>
      <input
        class="code-in"
        bind:value={newBatchCode}
        placeholder="Signup code (optional — e.g. induction26). Auto-generated if left blank."
      />
      {#if batches.length === 0}
        <p class="dim">No batches yet.</p>
      {:else}
        <ul class="batches">
          {#each batches as b (b.id)}
            <li class:active={selected?.id === b.id}>
              <button onclick={() => void open(b)}>
                <span class="name">{b.name}</span>
                <span class="meta">
                  {b.playerCount} player{b.playerCount === 1 ? '' : 's'} · {b.status}
                  {#if b.isDemo}· practice{/if}
                </span>
              </button>
            </li>
          {/each}
        </ul>
      {/if}
    </section>

    {#if selected}
      {#if selected.eventCode}
        {@const code = selected.eventCode}
        <section class="share">
          <h2>Signup link — {selected.name}</h2>
          <p class="dim">Share this one link with the whole cohort. Players sign up with their roll number.</p>
          <div class="row">
            <input readonly value={signupLink(code)} onfocus={(e) => e.currentTarget.select()} />
            <button class="ghost" onclick={() => void copySignupLink(code)}>Copy</button>
          </div>
        </section>
      {/if}
      <section>
        <h2>Roster — {selected.name}</h2>
        <p class="dim">
          Roster upload is optional with self-serve signup — use it to pre-seed names, or leave it and
          players register themselves.
        </p>
        <p class="dim">One player per line: <code>Name</code> or <code>Name, rollNumber</code>.</p>
        <textarea bind:value={rosterText} rows="5" placeholder={'Aditi Sharma, 21B-1042\nRohan Mehta, 21B-1043'}
        ></textarea>
        <details class="pin">
          <summary>Pin a route (for testing on site)</summary>
          <p class="dim">
            Five location ids, in the order they should be visited. Leave empty for a real
            assigned route.
          </p>
          <textarea bind:value={pinnedText} rows="2" placeholder="fountain library sibm amphitheatre symbieat"></textarea>
          <p class="dim ids">{LOCATIONS.map((l) => l.id).join(' · ')}</p>
          {#if !pinnedValid}
            <p class="bad">Needs exactly {LEVEL_COUNT} distinct ids from the list above.</p>
          {/if}
        </details>
        <div class="row">
          <button class="primary" disabled={busy || !rosterText.trim() || !pinnedValid} onclick={() => void addPlayers()}>
            Register players
          </button>
          {#if roster.length > 0}
            <button class="ghost" onclick={() => void copyAllLinks()}>Copy all links</button>
          {/if}
        </div>

        {#if roster.length > 0}
          <table>
            <thead>
              <tr><th>Player</th><th>Roll</th><th>Personal link</th></tr>
            </thead>
            <tbody>
              {#each roster as r (r.playerId)}
                <tr>
                  <td>{r.name}</td>
                  <td class="mono">{r.rosterId}</td>
                  <td class="link"><input readonly value={playerLink(r)} onfocus={(e) => e.currentTarget.select()} /></td>
                </tr>
              {/each}
            </tbody>
          </table>
        {/if}
      </section>

      <section>
        <h2>Live board</h2>
        {#if board.length === 0}
          <p class="dim">Nobody has started yet.</p>
        {:else}
          <table>
            <thead>
              <tr><th>#</th><th>Player</th><th>Level</th><th>Score vs par</th></tr>
            </thead>
            <tbody>
              {#each board as row (row.rank)}
                <tr>
                  <td class="mono">{row.rank}</td>
                  <td>{row.playerName}</td>
                  <td class="mono">{row.level === null ? 'finished' : `${row.level} of 5`}</td>
                  <td class="mono">{row.scoreMs === null ? '—' : formatMarquee(row.scoreMs)}</td>
                </tr>
              {/each}
            </tbody>
          </table>
        {/if}
      </section>
    {/if}
  {/if}
</main>

<style>
  main {
    max-width: 900px;
    margin: 0 auto;
    padding: calc(var(--safe-top) + var(--sp-6)) var(--edge) calc(var(--safe-bottom) + var(--sp-8));
    display: flex;
    flex-direction: column;
    gap: var(--sp-6);
  }
  header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--sp-3);
  }
  .gate {
    min-height: 70dvh;
    display: flex;
    flex-direction: column;
    justify-content: center;
    gap: var(--sp-3);
    max-width: 380px;
    margin: 0 auto;
  }
  h1 {
    font-family: var(--font-display);
    font-weight: 400;
    font-size: var(--step-28);
    margin: 0;
  }
  h2 {
    font-size: var(--step-17);
    margin: 0 0 var(--sp-2);
  }
  .dim {
    color: var(--text-dim);
    font-size: var(--step-15);
    margin: 0 0 var(--sp-2);
  }
  section {
    padding: var(--sp-4);
    border-radius: var(--radius-card);
    background: var(--surface);
    border: var(--glass-border);
  }
  .row {
    display: flex;
    align-items: center;
    gap: var(--sp-2);
    margin-bottom: var(--sp-3);
  }
  .row input {
    flex: 1;
    min-width: 0;
  }
  input,
  textarea {
    width: 100%;
    padding: 10px 12px;
    border-radius: 10px;
    border: var(--glass-border);
    background: rgba(0, 0, 0, 0.3);
    color: var(--text);
    font: inherit;
  }
  textarea {
    margin-bottom: var(--sp-3);
    resize: vertical;
  }
  button {
    padding: 10px 18px;
    border-radius: var(--radius-button);
    font-weight: 600;
    white-space: nowrap;
  }
  .primary {
    color: var(--amber-ink);
    background: var(--amber);
  }
  .primary:disabled {
    opacity: 0.5;
  }
  .ghost {
    color: var(--text-dim);
    border: var(--glass-border);
  }
  ul.batches {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  ul.batches button {
    width: 100%;
    text-align: left;
    padding: 10px 12px;
    border-radius: 10px;
    border: var(--glass-border);
    font-weight: 400;
  }
  li.active button {
    border-color: var(--amber);
  }
  .name {
    display: block;
  }
  .meta {
    display: block;
    font-size: var(--step-13);
    color: var(--text-dim);
  }
  table {
    width: 100%;
    border-collapse: collapse;
    font-size: var(--step-15);
  }
  th,
  td {
    text-align: left;
    padding: 8px 6px;
    border-bottom: 1px solid var(--hairline);
  }
  th {
    font-size: var(--step-13);
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: var(--text-dim);
    font-weight: 500;
  }
  .mono {
    font-family: var(--font-mono);
  }
  .pin {
    margin: var(--sp-3) 0;
  }
  .pin summary {
    cursor: pointer;
    font-size: var(--step-14);
  }
  .ids {
    font-family: var(--font-mono);
    font-size: var(--step-13);
    word-break: break-word;
  }
  .bad {
    color: var(--alert, #e06c5a);
    font-size: var(--step-14);
  }
  .code-in {
    width: 100%;
    margin-top: var(--sp-2);
    font-family: var(--font-mono);
    font-size: var(--step-13);
  }
  .share .row input {
    font-family: var(--font-mono);
    font-size: var(--step-13);
  }
  .link input {
    font-family: var(--font-mono);
    font-size: var(--step-13);
    padding: 6px 8px;
  }
</style>
