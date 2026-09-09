<script lang="ts">
  /**
   * The app name. One size, one face; only the "AR" is picked out — in amber —
   * so the augmented-reality pun reads out of "around" without changing the
   * shape of the word.
   */
  interface Props {
    /** CSS font-size for the mark. */
    size?: string
  }
  const {size = '3rem'}: Props = $props()
</script>

<span class="wordmark" style="font-size: {size}"><span class="ar">AR</span>ound Campus</span>

<style>
  .wordmark {
    font-family: var(--font-display);
    font-weight: 400;
    line-height: 0.95;
    letter-spacing: 0.01em;
    text-wrap: balance;
  }
  .ar {
    color: var(--amber);
  }
</style>
