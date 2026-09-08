<script lang="ts">
  /**
   * A chart card: title, the plot, and a table twin.
   *
   * The table is not a nicety. A chart that encodes anything in colour needs a
   * WCAG-clean equivalent, and a tooltip must never be the only way to read a
   * value — so every panel here can show its own numbers.
   */
  import type {Snippet} from 'svelte'

  interface Props {
    title: string
    subtitle?: string
    /** Column headings for the table twin. */
    columns: readonly string[]
    rows: ReadonlyArray<readonly string[]>
    wide?: boolean
    /**
     * The content is already a table, so the chart/table toggle would offer a
     * choice between a table and the same table.
     */
    plain?: boolean
    children: Snippet
  }

  const {title, subtitle, columns, rows, wide = false, plain = false, children}: Props = $props()

  let showTable = $state(false)
  const id = `panel-${Math.random().toString(36).slice(2, 8)}`
</script>

<section class="panel" class:wide>
  <header>
    <div>
      <h2>{title}</h2>
      {#if subtitle}<p>{subtitle}</p>{/if}
    </div>
    {#if !plain}
      <button
        class="toggle"
        aria-expanded={showTable}
        aria-controls={id}
        onclick={() => (showTable = !showTable)}
      >
        {showTable ? 'Chart' : 'Table'}
      </button>
    {/if}
  </header>

  {#if showTable}
    <div class="scroller" {id}>
      <table>
        <thead>
          <tr>{#each columns as c (c)}<th>{c}</th>{/each}</tr>
        </thead>
        <tbody>
          {#each rows as r, i (i)}
            <tr>{#each r as cell, j (j)}<td class:num={j > 0}>{cell}</td>{/each}</tr>
          {/each}
        </tbody>
      </table>
    </div>
  {:else}
    {@render children()}
  {/if}
</section>

<style>
  .panel {
    display: flex;
    flex-direction: column;
    gap: var(--sp-4);
    padding: var(--sp-4);
    border-radius: 16px;
    background: var(--surface);
    border: var(--glass-border);
    min-width: 0;
  }
  .wide {
    grid-column: 1 / -1;
  }
  header {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: var(--sp-3);
  }
  h2 {
    margin: 0;
    font-size: var(--step-15);
    font-weight: 600;
  }
  header p {
    margin: 2px 0 0;
    font-size: var(--step-13);
    color: var(--text-faint);
  }
  .toggle {
    flex: none;
    padding: 6px 10px;
    border-radius: 999px;
    border: 1px solid var(--hairline);
    color: var(--text-dim);
    font-size: var(--step-13);
  }
  .toggle:hover {
    color: var(--text);
    border-color: var(--hairline-bright);
  }
  .scroller {
    overflow-x: auto;
  }
  table {
    width: 100%;
    border-collapse: collapse;
    font-size: var(--step-13);
  }
  th,
  td {
    padding: 7px 10px 7px 0;
    text-align: left;
    border-bottom: 1px solid var(--hairline);
    white-space: nowrap;
  }
  th {
    color: var(--text-faint);
    font-weight: 500;
  }
  td {
    color: var(--text-dim);
  }
  td.num {
    font-variant-numeric: tabular-nums;
  }
</style>
