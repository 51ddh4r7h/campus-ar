<script lang="ts">
  import type {Snippet} from 'svelte'

  const {
    variant = 'primary',
    type = 'button',
    disabled = false,
    onclick,
    children,
  }: {
    variant?: 'primary' | 'secondary' | 'text'
    type?: 'button' | 'submit'
    disabled?: boolean
    onclick?: () => void
    children: Snippet
  } = $props()
</script>

<button class={variant} {type} {disabled} {onclick}>
  {@render children()}
</button>

<style>
  button {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: var(--sp-2);
    min-height: 44px;
    font-weight: 600;
    border-radius: var(--radius-button);
    transition:
      transform var(--dur-fast) var(--ease-spring),
      background var(--dur-fast) var(--ease-spring),
      opacity var(--dur-fast);
  }
  button:active {
    transform: scale(0.98);
  }
  button:disabled {
    opacity: 0.45;
    pointer-events: none;
  }

  .primary {
    height: 56px;
    padding: 0 var(--sp-6);
    color: var(--amber-ink);
    background: linear-gradient(180deg, color-mix(in srgb, var(--amber) 92%, white) 0%, var(--amber) 12%);
    box-shadow:
      inset 0 1px 0 rgba(255, 255, 255, 0.4),
      0 6px 20px rgba(232, 165, 76, 0.24);
  }
  .primary:active {
    background: var(--amber-press);
  }

  .secondary {
    height: 52px;
    padding: 0 var(--sp-6);
    color: var(--text);
    background: var(--surface);
    backdrop-filter: blur(var(--blur));
    border: var(--glass-border);
    border-top-color: var(--hairline-bright);
  }

  .text {
    min-height: 40px;
    padding: var(--sp-2) var(--sp-3);
    color: var(--text-dim);
    font-weight: 500;
  }
  .text:active {
    color: var(--text);
  }
</style>
