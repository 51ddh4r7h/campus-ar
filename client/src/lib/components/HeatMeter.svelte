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

  /**
   * Up from the moment the search starts.
   *
   * It used to hide itself until there was warmth to report — but heat reads a
   * flat zero beyond the layout's range, which is exactly where a player stands
   * when they have just been handed the clue. The gauge was therefore absent at
   * the one moment someone looks for it, and an instrument that is missing
   * reads as broken rather than as informative. "Cold" is a reading; nothing is
   * not.
   *
   * The only state still worth hiding for is having no fix at all, and that
   * says so rather than showing a zero it cannot stand behind.
   */
  const waiting = $derived(probe.last === null || probe.last.signalOk === false)
</script>

<div class="meter" class:waiting style="--h: {waiting ? 0 : shown}">
  <div class="track"><div class="fill"></div></div>
  <span class="word">{waiting ? 'Locating…' : BAND_WORDS[band]}</span>
</div>

<style>
  .waiting .word {
    color: var(--text-faint);
  }
  .waiting .fill {
    opacity: 0.25;
  }
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
