<script lang="ts">
</script>

<div class="badge" role="status">Practice</div>

<style>
  .badge {
    position: fixed;
    top: calc(var(--safe-top) + var(--sp-2));
    left: 50%;
    transform: translateX(-50%);
    z-index: 65;
    padding: 4px 12px;
    border-radius: 999px;
    font-size: var(--step-13);
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: var(--amber-ink);
    background: var(--amber);
    pointer-events: none;
  }
</style>