<script lang="ts">
  /**
   * Says that the movement is fake, not merely that the session is.
   *
   * It read "Practice", which is true and not the point. Practice runs drive a
   * GPS simulator that walks between stops on a timer, so levels complete
   * without anyone going anywhere — and a field test today passed two levels
   * from inside a classroom, with this badge on screen the whole time. The word
   * that was missing is the one that explains it.
   */
</script>

<div class="badge" role="status">
  <span class="dot"></span>
  Practice · simulated GPS
</div>

<style>
  .badge {
    position: fixed;
    top: calc(var(--safe-top) + var(--sp-2));
    left: 50%;
    transform: translateX(-50%);
    z-index: 65;
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 5px 12px;
    border-radius: 999px;
    font-size: var(--step-13);
    font-weight: 600;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: var(--amber-ink);
    background: var(--amber);
    box-shadow: 0 2px 12px rgba(0, 0, 0, 0.5);
    pointer-events: none;
    white-space: nowrap;
  }
  /* A slow blink: static chrome stops being read after a minute or two. */
  .dot {
    width: 7px;
    height: 7px;
    border-radius: 999px;
    background: var(--amber-ink);
    animation: pulse 2s ease-in-out infinite;
  }
  @keyframes pulse {
    50% {
      opacity: 0.25;
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .dot {
      animation: none;
    }
  }
</style>
