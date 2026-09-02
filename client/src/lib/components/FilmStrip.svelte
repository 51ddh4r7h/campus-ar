<script lang="ts">
  /**
   * Progress, as a strip of film.
   *
   * A bar would answer the wrong question. Progress here is not linear —
   * searching is unbounded, and a player who has found three of five is not
   * "60% done" in any sense they can act on. Worse, a bar reports distance
   * remaining, when the thing that decides their standing is how well they ran
   * the legs behind them.
   *
   * So: five frames of film. Empty ones are blank sprockets. Each find
   * *develops* its frame — the still from the scene fades in — and the frame
   * carries how the leg went in its own colour. Warm means the leg beat par,
   * washed-out means it did not. By the wrap the player is holding a strip of
   * the film they reconstructed, which is both the progress meter and the thing
   * worth keeping.
   *
   * The strip never shows anything about levels still to come. A locked frame
   * is blank because the player has earned nothing there yet, not because we
   * are hiding a picture behind it.
   */
  import type {SplitView} from '@cmh/shared'
  import {LEVEL_COUNT} from '@cmh/shared'

  interface Props {
    splits: readonly SplitView[]
    /** The level being played now, so its frame can sit in the gate. */
    current?: number
    /** 'hud' rides in the top bar; 'full' is the wrap-screen version. */
    size?: 'hud' | 'full'
  }

  const {splits, current = 0, size = 'hud'}: Props = $props()

  /**
   * Stills that would not load. A location whose clip files are not in place
   * yet still counts as found — the frame is exposed, it just has no picture on
   * it. Better a blank frame in a strip of film than a row of broken-image
   * glyphs in the HUD.
   */
  let blank = $state(new Set<string>())
  const markBlank = (id: string) => {
    if (!blank.has(id)) blank = new Set(blank).add(id)
  }

  type Frame =
    | {state: 'exposed'; level: number; split: SplitView; underPar: boolean}
    | {state: 'gate' | 'blank'; level: number}

  const frames = $derived.by((): Frame[] =>
    Array.from({length: LEVEL_COUNT}, (_, i) => {
      const level = i + 1
      const split = splits.find((s) => s.level === level)
      if (split) {
        // Penalties are part of how the leg went, so they count against par.
        const taken = split.splitMs + split.penaltyMs
        return {state: 'exposed', level, split, underPar: taken <= split.parMs}
      }
      return {state: level === current ? 'gate' : 'blank', level}
    }),
  )

  const label = $derived(
    `${splits.length} of ${LEVEL_COUNT} scenes found`,
  )
</script>

<div class="strip {size}" role="img" aria-label={label}>
  {#each frames as f (f.level)}
    <div
      class="cell {f.state}"
      class:par={f.state === 'exposed' && f.underPar}
      title={f.state === 'exposed' ? f.split.locationName : ''}
    >
      {#if f.state === 'exposed' && !blank.has(f.split.locationId)}
        <img
          src={f.split.posterUrl}
          alt=""
          loading="lazy"
          onerror={() => markBlank(f.split.locationId)}
        />
      {:else if f.state === 'exposed'}
        <span class="mark">{f.level}</span>
      {/if}
      {#if size === 'full' && f.state === 'exposed'}
        <span class="cap">{f.split.locationName}</span>
      {/if}
    </div>
  {/each}
</div>

<style>
  /* Sprocket holes down both edges: what makes the row read as film rather
     than as a row of thumbnails. Drawn as a repeating gradient so it scales
     with the strip instead of needing an asset. */
  .strip {
    display: flex;
    align-items: center;
    background: #0a0b0d;
    border-radius: 3px;
  }
  .strip::before,
  .strip::after {
    content: '';
    align-self: stretch;
    flex: none;
  }
  .cell {
    position: relative;
    flex: none;
    overflow: hidden;
    background: #16181c;
    box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.07);
  }
  .cell img {
    width: 100%;
    height: 100%;
    object-fit: cover;
    display: block;
    /* Developed but not printed well: a leg run over par keeps the picture and
       loses the colour, so the strip reads at a glance without a second gauge. */
    filter: grayscale(1) brightness(0.62);
    animation: develop 0.9s var(--ease-spring, ease-out) both;
  }
  .cell.par img {
    filter: none;
  }
  /* The frame in the gate — the one being shot right now. */
  .cell.gate {
    box-shadow: inset 0 0 0 1px var(--amber);
    animation: gate 2.4s ease-in-out infinite;
  }
  @keyframes develop {
    from {
      opacity: 0;
      filter: grayscale(1) brightness(0.1) contrast(2);
    }
  }
  @keyframes gate {
    50% {
      background: color-mix(in srgb, var(--amber) 22%, #16181c);
    }
  }

  /* ---- HUD: rides in the top bar, beside the clock ---- */
  .hud {
    gap: 2px;
    padding: 3px;
  }
  .hud::before,
  .hud::after {
    width: 3px;
    background:
      repeating-linear-gradient(to bottom, rgba(255, 255, 255, 0.28) 0 2px, transparent 2px 5px);
  }
  .hud .cell {
    width: 22px;
    height: 13px;
    border-radius: 1.5px;
  }

  /* ---- Full: the wrap-screen strip ---- */
  .full {
    gap: 4px;
    padding: 6px;
    border-radius: 6px;
    width: 100%;
  }
  .full::before,
  .full::after {
    width: 6px;
    background:
      repeating-linear-gradient(to bottom, rgba(255, 255, 255, 0.3) 0 5px, transparent 5px 11px);
  }
  .full .cell {
    flex: 1 1 0;
    aspect-ratio: 2.39 / 1;
    border-radius: 2px;
  }
  /* An exposed frame with no still: keep it clearly *found*, just pictureless. */
  .cell.exposed {
    background: color-mix(in srgb, var(--amber) 12%, #16181c);
  }
  .mark {
    position: absolute;
    inset: 0;
    display: grid;
    place-items: center;
    font-family: var(--font-mono);
    font-size: 9px;
    color: var(--amber);
    opacity: 0.7;
  }
  .full .mark {
    font-size: 15px;
  }
  .cap {
    position: absolute;
    left: 0;
    right: 0;
    bottom: 0;
    padding: 10px 4px 3px;
    font-size: 9px;
    line-height: 1.1;
    text-align: center;
    color: var(--text);
    background: linear-gradient(to top, rgba(0, 0, 0, 0.85), transparent);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  @media (prefers-reduced-motion: reduce) {
    .cell img,
    .cell.gate {
      animation: none;
    }
  }
</style>
