<script lang="ts">
  import {toasts} from '../stores/toast.svelte'
  import Icon from './Icon.svelte'
</script>

<div class="stack" aria-live="polite">
  {#each toasts.items as t (t.id)}
    <button class="toast {t.tone}" onclick={() => toasts.dismiss(t.id)}>
      {#if t.tone === 'alert'}<Icon name="x" size={16} />{/if}
      {#if t.tone === 'success'}<Icon name="check" size={16} />{/if}
      <span>{t.text}</span>
    </button>
  {/each}
</div>

<style>
  .stack {
    position: fixed;
    top: calc(var(--safe-top) + 64px);
    left: 0;
    right: 0;
    z-index: 60;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--sp-2);
    pointer-events: none;
  }
  .toast {
    pointer-events: auto;
    display: flex;
    align-items: center;
    gap: var(--sp-2);
    max-width: calc(100% - 2 * var(--edge));
    padding: 10px 16px;
    border-radius: 999px;
    font-size: var(--step-15);
    background: var(--surface);
    backdrop-filter: blur(var(--blur));
    border: var(--glass-border);
    border-top-color: var(--hairline-bright);
    animation: pop var(--dur-standard) var(--ease-spring);
  }
  .alert {
    color: var(--alert);
  }
  .success {
    color: var(--success);
  }
  @keyframes pop {
    from {
      opacity: 0;
      transform: translateY(-8px);
    }
  }
</style>
