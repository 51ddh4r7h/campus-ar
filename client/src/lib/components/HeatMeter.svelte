<script lang="ts">
  import {BAND_WORDS, glide, type HeatBand} from '@cmh/shared'
  import {probe} from '../stores/probe.svelte'
  import {haptics} from '../haptics'

  let shown = $state(0)
  let lastBand = $state<HeatBand>(0)

  const target = $derived(probe.last?.heat ?? 0)
  const band = $derived<HeatBand>(probe.last?.band ?? 0)

  $effect(() => {
    const id = setInterval(() => {
      shown = glide(shown, target)
    }, 60)
    return () => clearInterval(id)
  })

  $effect(() => {
    if (band !== lastBand) {
      if (band > lastBand) haptics.tick()
      lastBand = band
    }
  })

  // Hidden until there's any warmth at all — the clue does the long-range work.
  const visible = $derived(target > 4 || band > 0)
</script>

{#if visible}
  <div class="meter" style="--h: {shown}">
    <div class="track"><div class="fill"></div></div>
    <span class="word">{BAND_WORDS[band]}</span>
  </div>
{/if}

<style>
  .meter {
    position: fixed;
    right: var(--edge);
    top: 50%;
    transform: translateY(-50%);
    z-index: 15;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--sp-2);
  }
  .track {
    width: 6px;
    height: 42vh;
    max-height: 320px;
    border-radius: 3px;
    background: rgba(0, 0, 0, 0.35);
    border: 0.5px solid var(--hairline);
    overflow: hidden;
    display: flex;
    align-items: flex-end;
  }
  .fill {
    width: 100%;
    height: calc(var(--h) * 1%);
    border-radius: 3px;
    background: linear-gradient(to top, var(--signal-cold), var(--signal-hot));
    transition: height 0.06s linear;
  }
  .word {
    writing-mode: vertical-rl;
    font-size: var(--step-13);
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--text-dim);
    text-shadow: 0 1px 4px #000;
  }
</style>
