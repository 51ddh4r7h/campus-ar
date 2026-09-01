<script lang="ts">
  /**
   * The wrap — every location on campus, drawn as a plan.
   *
   * A randomised route only ever sends a player to five of the ten, so this is
   * the thing finishing buys: the whole map, with the five you found lit and
   * the five you never saw sitting dark. A list could say the same words; only
   * a plan shows how much of the campus you actually covered.
   *
   * Geometry is baked from OpenStreetMap at build time rather than fetched, so
   * it works on a bad signal and can be painted in the app's own palette
   * instead of pasting a bright standard tile into a dark interface.
   */
  import {MAP_FEATURES, MAP_LANDMARKS, MAP_SIZE, MAP_STOPS, MAP_WIDTH_M} from '../campus-map'

  const {found}: {found: ReadonlySet<string>} = $props()

  /** A 100 m rule, sized against the plan's real width. */
  const scaleW = (100 / MAP_WIDTH_M) * MAP_SIZE.w
  const featuresOf = (kind: string) => MAP_FEATURES.filter((f) => f.kind === kind)
</script>

<figure>
  <svg viewBox="0 0 {MAP_SIZE.w} {MAP_SIZE.h}" role="img" aria-label="Campus plan showing every location">
    <rect width={MAP_SIZE.w} height={MAP_SIZE.h} fill="var(--map-ground)" />

    {#each featuresOf('wood') as s (s.d)}
      <path d={s.d} fill="var(--map-wood)" stroke="none" />
    {/each}
    {#each featuresOf('water') as s (s.d)}
      <path d={s.d} fill="var(--map-water)" stroke="none" />
    {/each}
    {#each featuresOf('building') as s (s.d)}
      <path d={s.d} fill="var(--map-built)" stroke="none" />
    {/each}
    {#each featuresOf('road') as s (s.d)}
      <path d={s.d} fill="none" stroke="var(--map-road)" stroke-width="5" stroke-linecap="round" stroke-linejoin="round" />
    {/each}

    <!-- Institutes OSM holds only as points. Drawn faintly and behind the
         stops: they say what the buildings are without competing with the
         thing the player came here to read. -->
    {#each MAP_LANDMARKS as l (l.name)}
      <g class="landmark">
        <rect x={l.x - 4} y={l.y - 4} width="8" height="8" rx="1.5" />
        <text x={l.x} y={l.y - 9} text-anchor="middle">{l.name}</text>
      </g>
    {/each}

    {#each MAP_STOPS as s, i (s.id)}
      {@const hit = found.has(s.id)}
      <g class:hit>
        {#if hit}<circle cx={s.x} cy={s.y} r="24" class="halo" />{/if}
        <circle cx={s.x} cy={s.y} r="14" class="pin" />
        <text x={s.x} y={s.y + 6} text-anchor="middle" class="num">{i + 1}</text>
      </g>
    {/each}

    <g class="scale" transform="translate(26 {MAP_SIZE.h - 34})">
      <path d="M0 0 h{scaleW}" />
      <path d="M0 -4 v8 M{scaleW} -4 v8" />
      <text x={scaleW / 2} y="-9" text-anchor="middle">100 m</text>
    </g>
  </svg>
  <!-- Names sit in a key rather than on the plan. Across the whole hilltop the
       stops cluster tightly enough that labels collide into each other, and an
       unreadable map is worse than a numbered one. -->
  <ol class="key">
    {#each MAP_STOPS as s, i (s.id)}
      <li class:hit={found.has(s.id)}>
        <span class="n">{i + 1}</span>
        {s.name}
      </li>
    {/each}
  </ol>

  <figcaption>
    {found.size} of {MAP_STOPS.length} found · map data © OpenStreetMap contributors
  </figcaption>
</figure>

<style>
  figure {
    margin: 0;
    --map-ground: #0d1013;
    --map-wood: #14211a;
    --map-water: #12222c;
    --map-built: #1c2228;
    --map-road: #2f3841;
  }
  svg {
    display: block;
    width: 100%;
    height: auto;
    border-radius: 10px;
    border: var(--glass-border);
  }
  .pin {
    fill: var(--map-ground);
    stroke: var(--text-dim);
    stroke-width: 2.5;
  }
  .hit .pin {
    fill: var(--amber);
    stroke: var(--amber);
  }
  .halo {
    fill: color-mix(in srgb, var(--amber) 18%, transparent);
  }
  /* Sizes are viewBox units, not screen pixels: the plan is ~640 units wide
     and lands around 340px on a phone, so anything set at a screen-plausible
     13 would render at seven. */
  .landmark rect {
    fill: none;
    stroke: var(--text-dim);
    stroke-width: 1.5;
    opacity: 0.45;
  }
  .landmark text {
    font-family: var(--font-mono);
    font-size: 14px;
    fill: var(--text-dim);
    opacity: 0.55;
  }
  .num {
    font-family: var(--font-mono);
    font-size: 17px;
    font-weight: 600;
    fill: var(--text-dim);
  }
  .hit .num {
    fill: var(--amber-ink);
  }
  .key {
    list-style: none;
    margin: var(--sp-3) 0 0;
    padding: 0;
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(148px, 1fr));
    gap: 6px var(--sp-3);
    font-size: var(--step-13);
    color: var(--text-dim);
  }
  .key li {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .key li.hit {
    color: var(--text);
  }
  .key .n {
    flex: none;
    width: 20px;
    height: 20px;
    display: grid;
    place-items: center;
    border-radius: 999px;
    font-family: var(--font-mono);
    font-size: 11px;
    border: 1px solid var(--hairline);
  }
  .key li.hit .n {
    background: var(--amber);
    border-color: var(--amber);
    color: var(--amber-ink);
  }
  .scale path {
    stroke: var(--text-dim);
    stroke-width: 2.5;
    opacity: 0.6;
  }
  .scale text {
    font-family: var(--font-mono);
    font-size: 20px;
    fill: var(--text-dim);
    opacity: 0.75;
  }
  figcaption {
    margin-top: var(--sp-2);
    font-size: var(--step-13);
    color: var(--text-dim);
  }
</style>
