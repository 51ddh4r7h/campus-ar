<script lang="ts">
  import {LEVEL_COUNT, LOCATIONS} from '@cmh/shared'

  /** In dev, Vite proxies /api → the local worker; in prod this is the API Gateway URL. */
  const API_BASE = import.meta.env.VITE_API_BASE ?? '/api'

  type Health = {ok: boolean; levels: number; locationPool: number}
  let health = $state<Health | null>(null)
  let error = $state<string | null>(null)

  async function checkHealth() {
    error = null
    try {
      const res = await fetch(`${API_BASE}/health`)
      // SAFETY: scaffold-only health probe; the typed API client in Phase 2
      // validates every response body at this boundary.
      health = (await res.json()) as Health
    } catch (e) {
      error = e instanceof Error ? e.message : String(e)
    }
  }
</script>

<main>
  <h1>Campus<br />Movie Hunt</h1>
  <p class="tag">Scaffold — Phase 0. {LEVEL_COUNT} levels, {LOCATIONS.length} locations.</p>

  <button onclick={checkHealth}>Check API</button>

  {#if health}
    <pre>{JSON.stringify(health, null, 2)}</pre>
  {/if}
  {#if error}
    <p class="err">API not reachable: {error} — run <code>npm run dev:api</code></p>
  {/if}
</main>

<style>
  main {
    display: flex;
    flex-direction: column;
    gap: 16px;
    padding: calc(var(--safe-top) + 48px) 24px calc(var(--safe-bottom) + 24px);
    max-width: 420px;
  }
  h1 {
    font-family: var(--font-display);
    font-weight: 400;
    font-size: clamp(2.6rem, 12vw, 3.6rem);
    line-height: 0.98;
    margin: 0;
  }
  .tag {
    color: var(--text-dim);
    margin: 0;
  }
  button {
    align-self: flex-start;
    font: inherit;
    font-weight: 600;
    color: #1a1a17;
    background: var(--amber);
    border: 0;
    border-radius: var(--radius-button);
    padding: 12px 20px;
    transition: background var(--dur-standard) var(--ease-spring);
  }
  button:active {
    background: var(--amber-press);
  }
  pre {
    font-family: var(--font-mono);
    font-size: 13px;
    background: var(--surface);
    border: 1px solid var(--hairline);
    border-radius: 12px;
    padding: 12px;
    overflow-x: auto;
  }
  .err {
    color: var(--alert);
    font-size: 14px;
  }
</style>
