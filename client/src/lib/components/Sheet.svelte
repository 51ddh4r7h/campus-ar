<script lang="ts">
  import type {Snippet} from 'svelte'
  import {nav} from '../stores/nav.svelte'

  const {
    height = '70%',
    dismissable = true,
    title,
    children,
    footer,
  }: {
    height?: string
    dismissable?: boolean
    title?: string
    children: Snippet
    footer?: Snippet
  } = $props()

  let dragY = $state(0)
  let startY = 0
  let dragging = $state(false)

  function down(e: PointerEvent) {
    if (!dismissable) return
    dragging = true
    startY = e.clientY
    // SAFETY: this handler is bound only to the handle-zone <div>.
    if (e.currentTarget instanceof HTMLElement) e.currentTarget.setPointerCapture(e.pointerId)
  }
  function move(e: PointerEvent) {
    if (!dragging) return
    dragY = Math.max(0, e.clientY - startY)
  }
  function up() {
    if (!dragging) return
    dragging = false
    if (dragY > 120) nav.close()
    dragY = 0
  }
</script>

<div
  class="scrim"
  role="presentation"
  onclick={() => dismissable && nav.close()}
></div>

<div
  class="sheet"
  style="height: {height}; transform: translateY({dragY}px)"
  class:dragging
  aria-modal="true"
  role="dialog"
  aria-label={title ?? 'Sheet'}
>
  <div
    class="handle-zone"
    role="button"
    tabindex="-1"
    aria-label="Drag down to close"
    onpointerdown={down}
    onpointermove={move}
    onpointerup={up}
  >
    <div class="handle"></div>
  </div>
  {#if title}<h2>{title}</h2>{/if}
  <div class="body">{@render children()}</div>
  {#if footer}<div class="footer">{@render footer()}</div>{/if}
</div>

<style>
  .scrim {
    position: fixed;
    inset: 0;
    background: var(--scrim);
    animation: fade var(--dur-standard) ease;
    z-index: 40;
  }
  .sheet {
    position: fixed;
    left: 0;
    right: 0;
    bottom: 0;
    z-index: 41;
    display: flex;
    flex-direction: column;
    background: var(--surface-raised);
    backdrop-filter: blur(var(--blur));
    border-top: var(--glass-border);
    border-top-color: var(--hairline-bright);
    border-radius: var(--radius-card) var(--radius-card) 0 0;
    box-shadow: var(--glass-shadow);
    padding: 0 var(--edge) calc(var(--safe-bottom) + var(--sp-4));
    animation: rise var(--dur-sheet) var(--ease-spring);
  }
  .sheet:not(.dragging) {
    transition: transform var(--dur-sheet) var(--ease-spring);
  }
  .handle-zone {
    padding: var(--sp-3) 0 var(--sp-2);
    display: flex;
    justify-content: center;
    touch-action: none;
    cursor: grab;
  }
  .handle {
    width: 36px;
    height: 4px;
    border-radius: 2px;
    background: var(--text-dim);
  }
  h2 {
    font-family: var(--font-display);
    font-weight: 400;
    font-size: var(--step-28);
    margin: 0 0 var(--sp-3);
  }
  .body {
    flex: 1;
    overflow-y: auto;
    -webkit-overflow-scrolling: touch;
  }
  .footer {
    padding-top: var(--sp-4);
  }
  @keyframes rise {
    from {
      transform: translateY(100%);
    }
  }
  @keyframes fade {
    from {
      opacity: 0;
    }
  }
</style>
