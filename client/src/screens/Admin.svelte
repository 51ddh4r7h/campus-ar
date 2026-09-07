<script lang="ts">
  /**
   * Event operations console. Mutations update the local view immediately and
   * roll back on failure; background refreshes reconcile it with the server.
   */
  import {onMount} from 'svelte'
  import {LEVEL_COUNT, LOCATIONS, formatScore} from '@cmh/shared'
  import type {Session, StandingRow} from '@cmh/shared'
  import {api, ApiError, type BatchRow, type RosterEntry} from '../lib/api'
  import {toasts} from '../lib/stores/toast.svelte'

  const KEY_STORE = 'cmh.adminKey'
  const BOARD_POLL_MS = 10_000
  const timeFormat = new Intl.DateTimeFormat(undefined, {hour: '2-digit', minute: '2-digit'})

  let adminKey = $state('')
  let unlocked = $state(false)
  let batches = $state<BatchRow[]>([])
  let selected = $state<BatchRow | null>(null)
  let roster = $state<RosterEntry[]>([])
  let board = $state<StandingRow[]>([])

  let unlocking = $state(false)
  let refreshing = $state(false)
  let loadingEvent = $state(false)
  let creating = $state(false)
  let adding = $state(false)
  let mutating = $state(false)
  let loadError = $state('')
  let lastUpdated = $state<Date | null>(null)
  let detailRequest = 0

  let newBatchName = $state('')
  let newBatchCode = $state('')
  let rosterText = $state('')
  let pinnedText = $state('')
  let playerQuery = $state('')
  let pendingPlayers = $state<Array<{name: string; rosterId: string}>>([])

  type Confirmation =
    | {kind: 'close'; batch: BatchRow}
    | {kind: 'reset'; player: RosterEntry}
  let confirmation = $state<Confirmation | null>(null)
  let cancelButton = $state<HTMLButtonElement | null>(null)

  $effect(() => {
    if (confirmation) queueMicrotask(() => cancelButton?.focus())
  })

  const signupLink = (code: string): string =>
    `${window.location.origin}/?e=${encodeURIComponent(code)}`

  const playerLink = (r: RosterEntry): string =>
    `${window.location.origin}/?t=${encodeURIComponent(r.sessionToken)}&b=${encodeURIComponent(
      selected?.id ?? '',
    )}&n=${encodeURIComponent(r.name)}`

  const pinned = $derived(
    pinnedText
      .split(/[\s,]+/)
      .map((id) => id.trim())
      .filter(Boolean),
  )
  const pinnedValid = $derived(
    pinned.length === 0 ||
      (pinned.length === LEVEL_COUNT &&
        new Set(pinned).size === LEVEL_COUNT &&
        pinned.every((id) => LOCATIONS.some((location) => location.id === id))),
  )
  /**
   * Every registered player lands in exactly one bucket.
   *
   * `abandoned` had no tile, so a cohort of seven showed as 3 playing + 2
   * finished + 1 waiting and the organiser was left to wonder about the
   * seventh. The roster already calls that state "Ended early"; the summary
   * now says it too, and the four counts sum to the total.
   */
  const counts = $derived({
    registered: roster.length,
    playing: roster.filter((player) =>
      player.status === 'in_progress' || player.status === 'paused'
    ).length,
    finished: roster.filter((player) => player.status === 'complete').length,
    waiting: roster.filter((player) => player.status === 'not_started').length,
    stopped: roster.filter((player) => player.status === 'abandoned').length,
  })
  const filteredRoster = $derived.by(() => {
    const query = playerQuery.trim().toLocaleLowerCase()
    if (!query) return roster
    return roster.filter((player) =>
      `${player.name} ${player.rosterId} ${player.status}`.toLocaleLowerCase().includes(query)
    )
  })

  function setSelectedInUrl(id: string | null): void {
    const url = new URL(window.location.href)
    if (id) url.searchParams.set('batch', id)
    else url.searchParams.delete('batch')
    history.replaceState(null, '', url)
  }

  function syncSelected(next: BatchRow[]): void {
    if (!selected) return
    selected = next.find((batch) => batch.id === selected?.id) ?? null
    if (!selected) setSelectedInUrl(null)
  }

  const isCurrentDetail = (request: number, batchId: string): boolean =>
    request === detailRequest && selected?.id === batchId

  async function unlock(): Promise<void> {
    if (!adminKey.trim() || unlocking) return
    unlocking = true
    try {
      const next = (await api.listBatches(adminKey.trim())).batches
      adminKey = adminKey.trim()
      batches = next
      unlocked = true
      localStorage.setItem(KEY_STORE, adminKey)

      const requested = new URL(window.location.href).searchParams.get('batch')
      const initial = next.find((batch) => batch.id === requested)
      if (initial) await openBatch(initial)
    } catch (error) {
      toasts.show(error instanceof ApiError ? error.message : 'Could not unlock the console', 'alert')
    } finally {
      unlocking = false
    }
  }

  function lock(): void {
    localStorage.removeItem(KEY_STORE)
    adminKey = ''
    unlocked = false
    batches = []
    selected = null
    roster = []
    board = []
    setSelectedInUrl(null)
  }

  async function refreshBatches(silent = false): Promise<void> {
    if (refreshing) return
    refreshing = true
    try {
      const next = (await api.listBatches(adminKey)).batches
      batches = next
      syncSelected(next)
    } catch (error) {
      if (!silent) {
        toasts.show(error instanceof ApiError ? error.message : 'Could not refresh events', 'alert')
      }
    } finally {
      refreshing = false
    }
  }

  async function openBatch(batch: BatchRow): Promise<void> {
    if (batch.status === 'creating') return
    selected = batch
    roster = []
    board = []
    playerQuery = ''
    setSelectedInUrl(batch.id)
    await refreshSelected()
  }

  async function refreshSelected(): Promise<void> {
    if (!selected) return
    const batchId = selected.id
    const request = ++detailRequest
    loadingEvent = true
    loadError = ''
    try {
      const [players, standings] = await Promise.all([
        api.roster(batchId, adminKey),
        api.standings(batchId),
      ])
      if (!isCurrentDetail(request, batchId)) return
      roster = players.players
      board = standings.rows
      lastUpdated = new Date()
    } catch (error) {
      if (!isCurrentDetail(request, batchId)) return
      loadError = error instanceof ApiError
        ? error.message
        : 'Could not load this event. Check the connection and retry.'
    } finally {
      if (request === detailRequest) loadingEvent = false
    }
  }

  async function createBatch(): Promise<void> {
    const name = newBatchName.trim()
    if (!name || creating) return
    creating = true
    const tempId = `creating-${Date.now()}`
    const optimistic: BatchRow = {
      id: tempId,
      name,
      status: 'creating',
      isDemo: false,
      createdAtMs: Date.now(),
      playerCount: 0,
      eventCode: newBatchCode.trim() || null,
    }
    batches = [optimistic, ...batches]
    try {
      const created = await api.createBatch(
        name,
        false,
        adminKey,
        newBatchCode.trim() || undefined,
      )
      const ready: BatchRow = {
        id: created.id,
        name: created.name,
        status: 'open',
        isDemo: created.isDemo,
        createdAtMs: Date.now(),
        playerCount: 0,
        eventCode: created.eventCode,
      }
      batches = batches.map((batch) => batch.id === tempId ? ready : batch)
      newBatchName = ''
      newBatchCode = ''
      toasts.show(`${ready.name} created`, 'success')
      await openBatch(ready)
    } catch (error) {
      batches = batches.filter((batch) => batch.id !== tempId)
      toasts.show(error instanceof ApiError ? error.message : 'Could not create the event', 'alert')
    } finally {
      creating = false
    }
  }

  function parseRoster(text: string): Array<{name: string; rosterId: string}> {
    return text
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line, index) => {
        const [name, rosterId] = line.split(',').map((part) => part.trim())
        return {
          name: name || `Player ${index + 1}`,
          rosterId: rosterId || `r-${Date.now()}-${index}`,
        }
      })
  }

  const registrationRows = (players: Array<{name: string; rosterId: string}>) =>
    pinned.length > 0
      ? players.map((player) => ({...player, route: [...pinned]}))
      : players

  async function addPlayers(): Promise<void> {
    if (!selected) return
    if (!pinnedValid || adding) return
    const parsed = parseRoster(rosterText)
    if (parsed.length === 0) return
    const players = registrationRows(parsed)
    const batchId = selected.id
    pendingPlayers = parsed
    adding = true
    rosterText = ''
    try {
      const added = await api.registerPlayers(batchId, players, adminKey)
      if (selected?.id !== batchId) return
      const known = new Set(roster.map((player) => player.playerId))
      roster = [...roster, ...added.players.filter((player) => !known.has(player.playerId))]
      batches = batches.map((batch) =>
        batch.id === batchId ? {...batch, playerCount: roster.length} : batch
      )
      syncSelected(batches)
      toasts.show(`${added.players.length} player${added.players.length === 1 ? '' : 's'} registered`, 'success')
    } catch (error) {
      rosterText = parsed.map((player) => `${player.name}, ${player.rosterId}`).join('\n')
      toasts.show(error instanceof ApiError ? error.message : 'Could not register those players', 'alert')
    } finally {
      pendingPlayers = []
      adding = false
    }
  }

  async function closeBatch(batch: BatchRow): Promise<void> {
    if (mutating) return
    const previousBatches = batches
    const previousSelected = selected
    mutating = true
    batches = batches.map((row) => row.id === batch.id ? {...row, status: 'closed'} : row)
    syncSelected(batches)
    confirmation = null
    try {
      const result = await api.closeBatch(batch.id, adminKey)
      const suffix = result.sessions > 0
        ? ` · ended ${result.sessions} running hunt${result.sessions === 1 ? '' : 's'}`
        : ''
      toasts.show(`Event closed${suffix}`, 'success')
      await refreshSelected()
    } catch (error) {
      batches = previousBatches
      selected = previousSelected
      toasts.show(error instanceof ApiError ? error.message : 'Could not close the event', 'alert')
    } finally {
      mutating = false
    }
  }

  async function resetPlayer(player: RosterEntry): Promise<void> {
    if (!selected || mutating) return
    const previousRoster = roster
    const batchId = selected.id
    mutating = true
    confirmation = null
    roster = roster.map((row) =>
      row.playerId === player.playerId
        ? {...row, status: 'not_started', currentLevel: 1, scoreMs: null}
        : row
    )
    try {
      const response = await api.resetPlayer(batchId, player.playerId, adminKey)
      if (selected?.id !== batchId) return
      roster = roster.map((row) =>
        row.playerId === player.playerId ? {...row, ...sessionFields(response.session)} : row
      )
      toasts.show(`${player.name} is back at the start`, 'success')
      await refreshSelected()
    } catch (error) {
      if (selected?.id === batchId) {
        roster = previousRoster
      }
      toasts.show(error instanceof ApiError ? error.message : 'Could not reset that player', 'alert')
    } finally {
      mutating = false
    }
  }

  const sessionFields = (session: Session) => ({
    status: session.status,
    currentLevel: session.currentLevel,
    scoreMs: session.scoreMs,
  })

  async function performConfirmedAction(): Promise<void> {
    const action = confirmation
    if (!action) return
    if (action.kind === 'close') await closeBatch(action.batch)
    else await resetPlayer(action.player)
  }

  function closeConfirmationOnEscape(event: KeyboardEvent): void {
    if (event.key === 'Escape' && confirmation && !mutating) confirmation = null
  }

  async function copy(text: string, success: string): Promise<void> {
    try {
      await navigator.clipboard.writeText(text)
      toasts.show(success, 'success')
    } catch {
      toasts.show('Clipboard blocked — select the text and copy it manually', 'alert')
    }
  }

  const copyAllLinks = (): Promise<void> =>
    copy(roster.map((player) => `${player.name}\t${playerLink(player)}`).join('\n'), 'Player links copied')

  function statusLabel(player: RosterEntry): string {
    if (player.status === 'not_started') return 'Not started'
    if (player.status === 'in_progress') return `Level ${player.currentLevel}`
    if (player.status === 'paused') return `Paused · level ${player.currentLevel}`
    if (player.status === 'complete') return 'Finished'
    return 'Ended early'
  }

  onMount(() => {
    const saved = localStorage.getItem(KEY_STORE)
    if (saved) {
      adminKey = saved
      void unlock()
    }
    const interval = setInterval(() => {
      if (!document.hidden && selected && !loadingEvent && !mutating) {
        void refreshSelected()
      }
    }, BOARD_POLL_MS)
    return () => clearInterval(interval)
  })
</script>

<svelte:window onkeydown={closeConfirmationOnEscape} />

<svelte:head>
  <title>Organiser Console · Campus Movie Hunt</title>
</svelte:head>

<main>
  {#if !unlocked}
    <form class="gate card" onsubmit={(event) => (event.preventDefault(), void unlock())}>
      <span class="eyebrow">Campus Movie Hunt</span>
      <h1>Organiser Console</h1>
      <p>Manage events, players, links, and live progress.</p>
      <label for="admin-key">Admin key</label>
      <input
        id="admin-key"
        name="admin-key"
        type="password"
        autocomplete="current-password"
        spellcheck="false"
        bind:value={adminKey}
        placeholder="Enter deployment key…"
      />
      <button class="primary" type="submit" disabled={unlocking || !adminKey.trim()}>
        {unlocking ? 'Checking…' : 'Open Console'}
      </button>
    </form>
  {:else}
    <header>
      <div>
        <span class="eyebrow">Campus Movie Hunt</span>
        <h1>Organiser Console</h1>
      </div>
      <div class="header-actions">
        <span class="updated" aria-live="polite">
          {lastUpdated ? `Updated ${timeFormat.format(lastUpdated)}` : 'Ready'}
        </span>
        <button class="ghost" disabled={refreshing || loadingEvent} onclick={() => void Promise.all([refreshBatches(), refreshSelected()])}>
          {refreshing || loadingEvent ? 'Refreshing…' : 'Refresh'}
        </button>
        <button class="text-button" onclick={lock}>Lock</button>
      </div>
    </header>

    <div class="workspace">
      <aside>
        <section class="card create">
          <div class="section-heading">
            <div>
              <span class="kicker">Setup</span>
              <h2>New Event</h2>
            </div>
          </div>
          <form onsubmit={(event) => (event.preventDefault(), void createBatch())}>
            <label for="event-name">Event name</label>
            <input
              id="event-name"
              name="event-name"
              autocomplete="off"
              bind:value={newBatchName}
              placeholder="Induction 2026 — Group A…"
            />
            <label for="event-code">Signup code <span>Optional</span></label>
            <input
              id="event-code"
              name="event-code"
              autocomplete="off"
              spellcheck="false"
              bind:value={newBatchCode}
              placeholder="induction26…"
            />
            <button class="primary" type="submit" disabled={creating || !newBatchName.trim()}>
              {creating ? 'Creating…' : 'Create Event'}
            </button>
          </form>
        </section>

        <nav class="card events" aria-label="Events">
          <div class="section-heading">
            <div>
              <span class="kicker">Workspace</span>
              <h2>Events</h2>
            </div>
            <span class="count">{batches.length}</span>
          </div>
          {#if batches.length === 0}
            <p class="empty">No events yet. Create the first one above.</p>
          {:else}
            <ul>
              {#each batches as batch (batch.id)}
                <li>
                  <button
                    class="event"
                    class:active={selected?.id === batch.id}
                    disabled={batch.status === 'creating'}
                    aria-current={selected?.id === batch.id ? 'page' : undefined}
                    onclick={() => void openBatch(batch)}
                  >
                    <span class="event-copy">
                      <strong>{batch.name}</strong>
                      <small>{batch.playerCount} player{batch.playerCount === 1 ? '' : 's'}</small>
                    </span>
                    <span class="status {batch.status}">{batch.status === 'creating' ? 'Creating…' : batch.status}</span>
                  </button>
                </li>
              {/each}
            </ul>
          {/if}
        </nav>
      </aside>

      <div class="detail">
        {#if !selected}
          <section class="card welcome">
            <span class="kicker">Get Started</span>
            <h2>Select an Event</h2>
            <p>Choose an event to manage its signup link, roster, and live board.</p>
          </section>
        {:else}
          <section class="event-hero card">
            <div class="event-title">
              <span class="status {selected.status}">{selected.status}</span>
              <h2>{selected.name}</h2>
              <p>{selected.eventCode ? `Signup code: ${selected.eventCode}` : 'No self-serve signup code'}</p>
            </div>
            {#if selected.status !== 'closed'}
              <button class="danger-quiet" onclick={() => (confirmation = {kind: 'close', batch: selected!})}>
                Close Event
              </button>
            {/if}
          </section>

          <section class="metrics" aria-label="Event summary">
            <article class="card"><span>Registered</span><strong>{counts.registered}</strong></article>
            <article class="card"><span>Playing</span><strong>{counts.playing}</strong></article>
            <article class="card"><span>Finished</span><strong>{counts.finished}</strong></article>
            <article class="card"><span>Waiting</span><strong>{counts.waiting}</strong></article>
            <article class="card"><span>Ended early</span><strong>{counts.stopped}</strong></article>
          </section>

          {#if loadError}
            <div class="error-banner" role="alert">
              <span>{loadError}</span>
              <button onclick={() => void refreshSelected()}>Retry</button>
            </div>
          {/if}

          {#if selected.eventCode}
            {@const code = selected.eventCode}
            <section class="card">
              <div class="section-heading">
                <div>
                  <span class="kicker">Invite</span>
                  <h2>Signup Link</h2>
                </div>
                <button class="ghost" onclick={() => void copy(signupLink(code), 'Signup link copied')}>Copy Link</button>
              </div>
              <p class="supporting">Share one link with the cohort. Players create their own account using a roll number.</p>
              <label class="sr-only" for="signup-link">Signup link</label>
              <input id="signup-link" class="mono" readonly value={signupLink(code)} onfocus={(event) => event.currentTarget.select()} />
            </section>
          {/if}

          <section class="card">
            <div class="section-heading">
              <div>
                <span class="kicker">People</span>
                <h2>Register Players</h2>
              </div>
            </div>
            <p class="supporting">Optional with self-serve signup. Add 1 player per line as <code>Name, roll number</code>.</p>
            <label for="roster">Player list</label>
            <textarea
              id="roster"
              name="roster"
              autocomplete="off"
              bind:value={rosterText}
              rows="4"
              placeholder={'Aditi Sharma, 21B-1042\nRohan Mehta, 21B-1043'}
            ></textarea>
            <details>
              <summary>Pin a test route</summary>
              <p class="supporting">Enter {LEVEL_COUNT} distinct location IDs in visit order. Leave blank for balanced assignment.</p>
              <label for="pinned-route">Location IDs</label>
              <textarea
                id="pinned-route"
                name="pinned-route"
                autocomplete="off"
                spellcheck="false"
                bind:value={pinnedText}
                rows="2"
                aria-describedby="route-help"
                placeholder="fountain library sibm amphitheatre symbieat…"
              ></textarea>
              <p id="route-help" class="ids">{LOCATIONS.map((location) => location.id).join(' · ')}</p>
              {#if !pinnedValid}
                <p class="field-error" role="alert">Use exactly {LEVEL_COUNT} distinct IDs from the list.</p>
              {/if}
            </details>
            <button class="primary" disabled={adding || !rosterText.trim() || !pinnedValid} onclick={() => void addPlayers()}>
              {adding ? `Registering ${pendingPlayers.length}…` : 'Register Players'}
            </button>
          </section>

          <section class="card">
            <div class="section-heading">
              <div>
                <span class="kicker">Roster</span>
                <h2>Players <span class="count">{roster.length}</span></h2>
              </div>
              {#if roster.length > 0}
                <button class="ghost" onclick={() => void copyAllLinks()}>Copy All Links</button>
              {/if}
            </div>

            {#if roster.length > 5}
              <label class="sr-only" for="player-search">Search players</label>
              <input
                id="player-search"
                class="search"
                type="search"
                name="player-search"
                autocomplete="off"
                bind:value={playerQuery}
                placeholder="Search name, roll number, or status…"
              />
            {/if}

            <div class="table-wrap">
              <table>
                <thead>
                  <tr><th>Player</th><th>Status</th><th>Personal Link</th><th><span class="sr-only">Actions</span></th></tr>
                </thead>
                <tbody>
                  {#each filteredRoster as player (player.playerId)}
                    <tr>
                      <td><strong>{player.name}</strong><small class="mono">{player.rosterId}</small></td>
                      <td><span class="player-status {player.status}">{statusLabel(player)}</span></td>
                      <td><button class="copy-link" onclick={() => void copy(playerLink(player), `${player.name}’s link copied`)}>Copy Link</button></td>
                      <td><button class="row-action" onclick={() => (confirmation = {kind: 'reset', player})}>Reset</button></td>
                    </tr>
                  {/each}
                  {#each pendingPlayers as player (`pending-${player.rosterId}`)}
                    <tr class="pending">
                      <td><strong>{player.name}</strong><small class="mono">{player.rosterId}</small></td>
                      <td><span class="player-status">Registering…</span></td>
                      <td>—</td><td>—</td>
                    </tr>
                  {/each}
                </tbody>
              </table>
            </div>
            {#if roster.length === 0 && pendingPlayers.length === 0}
              <p class="empty">No players yet. Share the signup link or register players above.</p>
            {:else if filteredRoster.length === 0 && pendingPlayers.length === 0}
              <p class="empty">No players match “{playerQuery}”.</p>
            {/if}
          </section>

          <section class="card">
            <div class="section-heading">
              <div>
                <span class="kicker">Live</span>
                <h2>Leaderboard</h2>
              </div>
              {#if loadingEvent}<span class="loading-dot" aria-label="Updating"></span>{/if}
            </div>
            <div class="table-wrap">
              {#if board.length === 0}
                <p class="empty">Nobody is on the board yet.</p>
              {:else}
                <table>
                  <thead><tr><th>Rank</th><th>Player</th><th>Progress</th><th>Score vs Par</th></tr></thead>
                  <tbody>
                    {#each board as row (`${row.rank}-${row.playerName}`)}
                      <tr>
                        <td class="rank mono">#{row.rank}</td>
                        <td><strong>{row.playerName}</strong></td>
                        <td>{row.level === null ? 'Finished' : `Level ${row.level} of ${LEVEL_COUNT}`}</td>
                        <!-- `formatScore`, not `formatMarquee`: this column is signed, and
                             marquee clamps below zero — so every under-par finisher, which
                             is most of them, printed 0:00 and the board read as a tie. -->
                        <td class="mono score">{row.scoreMs === null ? '—' : formatScore(row.scoreMs)}</td>
                      </tr>
                    {/each}
                  </tbody>
                </table>
              {/if}
            </div>
          </section>
        {/if}
      </div>
    </div>
  {/if}
</main>

{#if confirmation}
  <div class="backdrop" role="presentation">
    <div class="confirm" role="alertdialog" aria-modal="true" aria-labelledby="confirm-title">
      <span class="kicker">Please Confirm</span>
      {#if confirmation.kind === 'close'}
        <h2 id="confirm-title">Close {confirmation.batch.name}?</h2>
        <p>Signups stop immediately. Any running hunts end where players currently are.</p>
        <button class="danger" disabled={mutating} onclick={() => void performConfirmedAction()}>
          {mutating ? 'Closing…' : 'Close Event'}
        </button>
      {:else}
        <h2 id="confirm-title">Reset {confirmation.player.name}?</h2>
        <p>Their route, progress, splits, and current score are replaced. Their account stays signed in.</p>
        <button class="danger" disabled={mutating} onclick={() => void performConfirmedAction()}>
          {mutating ? 'Resetting…' : 'Reset Player'}
        </button>
      {/if}
      <button bind:this={cancelButton} class="ghost" disabled={mutating} onclick={() => (confirmation = null)}>Cancel</button>
    </div>
  </div>
{/if}

<style>
  :global(body) {
    background:
      radial-gradient(70rem 38rem at 80% -10%, rgba(232, 165, 76, 0.09), transparent 60%),
      var(--bg);
  }
  main {
    min-height: 100dvh;
    max-width: 1440px;
    margin: 0 auto;
    padding: calc(var(--safe-top) + var(--sp-5)) clamp(16px, 3vw, 44px) calc(var(--safe-bottom) + var(--sp-8));
  }
  header {
    position: sticky;
    top: 0;
    z-index: 10;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--sp-4);
    margin: calc(-1 * var(--sp-5)) calc(-1 * clamp(16px, 3vw, 44px)) var(--sp-5);
    padding: calc(var(--safe-top) + var(--sp-4)) clamp(16px, 3vw, 44px) var(--sp-4);
    border-bottom: 1px solid var(--hairline);
    background: color-mix(in srgb, var(--bg) 88%, transparent);
    backdrop-filter: blur(18px);
  }
  h1, h2, p { margin-top: 0; }
  h1 {
    margin-bottom: 0;
    font-family: var(--font-display);
    font-size: var(--step-28);
    font-weight: 400;
    text-wrap: balance;
  }
  h2 {
    margin-bottom: 0;
    font-size: var(--step-20);
    text-wrap: balance;
  }
  .eyebrow, .kicker {
    display: block;
    margin-bottom: 4px;
    color: var(--amber);
    font-family: var(--font-mono);
    font-size: var(--step-13);
    letter-spacing: 0.11em;
    text-transform: uppercase;
  }
  .workspace {
    display: grid;
    grid-template-columns: minmax(250px, 320px) minmax(0, 1fr);
    gap: var(--sp-5);
    align-items: start;
  }
  aside {
    position: sticky;
    top: 106px;
    display: grid;
    /* A bare `auto` track cannot go narrower than its content's min-content, so
       one long event name pushed this column to 790px inside a 320px sidebar —
       the Create Event button and every name were cut off. `minmax(0, 1fr)`
       lets the track shrink to the column it was given. */
    grid-template-columns: minmax(0, 1fr);
    gap: var(--sp-4);
    max-height: calc(100dvh - 126px);
    overflow-y: auto;
    /* `overflow-y: auto` alone computes overflow-x to `auto` too, which is what
       turned that overflow into a sideways scrollbar rather than a visible bug. */
    overflow-x: clip;
    scrollbar-width: thin;
  }
  .detail {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    gap: var(--sp-4);
    min-width: 0;
  }
  .card {
    padding: clamp(16px, 2.2vw, 24px);
    border: var(--glass-border);
    border-radius: var(--radius-card);
    background: color-mix(in srgb, var(--surface) 92%, transparent);
    box-shadow: 0 14px 40px rgba(0, 0, 0, 0.14);
  }
  .gate {
    width: min(100%, 420px);
    margin: 12dvh auto 0;
  }
  .gate h1 { font-size: var(--step-40); }
  .gate p, .supporting {
    color: var(--text-dim);
    line-height: 1.5;
  }
  form { display: grid; gap: var(--sp-2); }
  label {
    margin-top: var(--sp-2);
    color: var(--text-dim);
    font-size: var(--step-13);
    font-weight: 600;
  }
  label span { color: var(--text-faint); font-weight: 400; }
  input, textarea {
    width: 100%;
    min-width: 0;
    padding: 11px 12px;
    border: 1px solid var(--hairline);
    border-radius: 10px;
    background: rgba(0, 0, 0, 0.26);
    color: var(--text);
    font: inherit;
  }
  input:focus, textarea:focus {
    border-color: color-mix(in srgb, var(--amber) 70%, transparent);
  }
  textarea { resize: vertical; }
  button {
    min-height: 42px;
    padding: 9px 15px;
    border-radius: var(--radius-button);
    font-weight: 650;
    touch-action: manipulation;
    transition: transform 120ms ease, border-color 120ms ease, background-color 120ms ease;
  }
  button:hover:not(:disabled) { border-color: color-mix(in srgb, var(--amber) 50%, var(--hairline)); }
  button:active:not(:disabled) { transform: translateY(1px); }
  /* `not-allowed`, never `wait`: macOS draws `wait` as the spinning beachball,
     which reads as "the app has hung". Most disabled buttons here are not busy
     at all — Create Event is disabled until the name field has something in it,
     so a freshly opened console beachballed on hover. The ones that really are
     mid-request already say so in their own label. */
  button:disabled { cursor: not-allowed; opacity: 0.52; }
  .primary {
    color: var(--amber-ink);
    background: var(--amber);
  }
  form .primary { margin-top: var(--sp-2); }
  .ghost {
    border: 1px solid var(--hairline);
    color: var(--text-dim);
  }
  .text-button, .row-action, .copy-link {
    min-height: 36px;
    padding: 6px 10px;
    color: var(--text-dim);
    font-size: var(--step-13);
  }
  .row-action:hover, .danger-quiet:hover { color: var(--alert); }
  .header-actions {
    display: flex;
    align-items: center;
    gap: var(--sp-2);
  }
  .updated {
    color: var(--text-faint);
    font-size: var(--step-13);
  }
  .section-heading, .event-hero {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: var(--sp-3);
  }
  .section-heading { margin-bottom: var(--sp-3); }
  .count {
    display: inline-grid;
    place-items: center;
    min-width: 25px;
    height: 25px;
    padding: 0 7px;
    border-radius: 999px;
    background: var(--surface-raised);
    color: var(--text-dim);
    font: 500 var(--step-13) var(--font-mono);
  }
  .events ul {
    display: grid;
    /* Grid items default to `min-width: auto`, so a row will not shrink below
       its longest word — and the row is what the name's ellipsis is measured
       against. Without this the truncation never triggers. */
    grid-template-columns: minmax(0, 1fr);
    gap: 5px;
    margin: 0;
    padding: 0;
    list-style: none;
  }
  .event {
    display: flex;
    width: 100%;
    align-items: center;
    justify-content: space-between;
    gap: var(--sp-2);
    padding: 10px;
    border: 1px solid transparent;
    border-radius: 10px;
    text-align: left;
  }
  .event:hover { background: var(--surface-raised); }
  .event.active {
    border-color: color-mix(in srgb, var(--amber) 45%, transparent);
    background: color-mix(in srgb, var(--amber) 9%, transparent);
  }
  .event-copy { min-width: 0; }
  .event-copy strong, .event-copy small {
    display: block;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .event-copy small { margin-top: 2px; color: var(--text-faint); }
  .status, .player-status {
    display: inline-flex;
    flex: none;
    align-items: center;
    width: max-content;
    padding: 3px 8px;
    border: 1px solid var(--hairline);
    border-radius: 999px;
    color: var(--text-dim);
    font-size: var(--step-13);
    text-transform: capitalize;
  }
  .status.open, .player-status.in_progress {
    border-color: color-mix(in srgb, #65c18c 45%, transparent);
    color: #8cdaa9;
    background: color-mix(in srgb, #65c18c 9%, transparent);
  }
  .status.closed, .player-status.abandoned { opacity: 0.68; }
  .player-status.complete {
    border-color: color-mix(in srgb, var(--amber) 45%, transparent);
    color: var(--amber);
  }
  .event-title p { margin: 5px 0 0; color: var(--text-dim); }
  .event-title h2 { margin-top: 9px; font-size: var(--step-28); }
  .danger-quiet {
    color: var(--text-dim);
    border: 1px solid color-mix(in srgb, var(--alert) 36%, transparent);
  }
  .metrics {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(132px, 1fr));
    gap: var(--sp-3);
  }
  .metrics article { padding: var(--sp-3) var(--sp-4); }
  .metrics span { color: var(--text-dim); font-size: var(--step-13); }
  .metrics strong {
    display: block;
    margin-top: 3px;
    font: 500 var(--step-28) var(--font-mono);
    font-variant-numeric: tabular-nums;
  }
  code, .mono, .ids {
    font-family: var(--font-mono);
    font-variant-numeric: tabular-nums;
  }
  details {
    margin: var(--sp-3) 0;
    padding: var(--sp-3);
    border: 1px solid var(--hairline);
    border-radius: 10px;
  }
  summary { cursor: pointer; font-weight: 600; }
  .ids { color: var(--text-faint); font-size: var(--step-13); overflow-wrap: anywhere; }
  .field-error { color: var(--alert); font-size: var(--step-13); }
  .search { margin-bottom: var(--sp-3); }
  .table-wrap {
    /* Positioned so the `.sr-only` label in the table header resolves against
       this box. Absolutely positioned with no positioned ancestor it resolved
       against the page instead, sat at x=406 on a 375px screen, and scrolled
       the whole console sideways — while the table it belongs to was already
       scrolling correctly inside here. */
    position: relative;
    width: 100%;
    overflow-x: auto;
    border-radius: 10px;
  }
  table {
    width: 100%;
    border-collapse: collapse;
    font-size: var(--step-15);
  }
  th, td {
    padding: 10px 8px;
    border-bottom: 1px solid var(--hairline);
    text-align: left;
    vertical-align: middle;
  }
  th {
    color: var(--text-faint);
    font-size: var(--step-13);
    font-weight: 600;
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }
  td strong, td small { display: block; }
  td small { margin-top: 2px; color: var(--text-faint); }
  tbody tr:last-child td { border-bottom: 0; }
  tbody tr:hover { background: color-mix(in srgb, var(--surface-raised) 65%, transparent); }
  tr.pending { opacity: 0.58; }
  .rank, .score { white-space: nowrap; font-variant-numeric: tabular-nums; }
  .empty, .welcome p {
    margin: var(--sp-3) 0 0;
    color: var(--text-dim);
  }
  .welcome { min-height: 260px; display: grid; align-content: center; justify-items: center; text-align: center; }
  .error-banner {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--sp-3);
    padding: var(--sp-3) var(--sp-4);
    border: 1px solid color-mix(in srgb, var(--alert) 45%, transparent);
    border-radius: 10px;
    color: var(--alert);
    background: color-mix(in srgb, var(--alert) 8%, transparent);
  }
  .loading-dot {
    width: 9px;
    height: 9px;
    border-radius: 50%;
    background: var(--amber);
    animation: pulse 1s ease-in-out infinite alternate;
  }
  .backdrop {
    position: fixed;
    inset: 0;
    z-index: 100;
    display: grid;
    place-items: center;
    padding: var(--edge);
    background: rgba(0, 0, 0, 0.74);
    backdrop-filter: blur(8px);
    overscroll-behavior: contain;
  }
  .confirm {
    width: min(100%, 430px);
    padding: var(--sp-5);
    border: var(--glass-border);
    border-radius: var(--radius-card);
    background: var(--surface-raised);
    box-shadow: 0 24px 80px rgba(0, 0, 0, 0.45);
  }
  .confirm p { color: var(--text-dim); line-height: 1.55; }
  .confirm button { width: 100%; margin-top: var(--sp-2); }
  .danger {
    color: #fff;
    background: color-mix(in srgb, var(--alert) 80%, #7a1717);
  }
  .sr-only {
    position: absolute;
    width: 1px;
    height: 1px;
    padding: 0;
    margin: -1px;
    overflow: hidden;
    clip: rect(0, 0, 0, 0);
    white-space: nowrap;
    border: 0;
  }
  @keyframes pulse {
    to { opacity: 0.35; transform: scale(0.72); }
  }
  @media (prefers-reduced-motion: reduce) {
    button { transition: none; }
    .loading-dot { animation: none; }
  }
  @media (max-width: 800px) {
    main { padding-inline: var(--edge); }
    header {
      position: static;
      align-items: flex-start;
      margin-inline: calc(-1 * var(--edge));
      padding-inline: var(--edge);
    }
    .updated { display: none; }
    .workspace { grid-template-columns: minmax(0, 1fr); }
    aside { position: static; max-height: none; overflow: visible; }
  }
  @media (max-width: 520px) {
    .header-actions { gap: 2px; }
    .header-actions button { padding-inline: 9px; }
    .card { padding: var(--sp-4); }
    .event-hero { align-items: flex-start; }
    .danger-quiet { min-height: 36px; padding: 6px 9px; font-size: var(--step-13); }
    th, td { padding-inline: 7px; }
  }
</style>
