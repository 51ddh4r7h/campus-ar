<script lang="ts">
  /** Line icons — 24px grid, 1.5 stroke, rounded. */
  type Name =
    | 'play'
    | 'eye'
    | 'pin'
    | 'bulb'
    | 'crosshair'
    | 'trophy'
    | 'timer'
    | 'lock'
    | 'check'
    | 'x'
    | 'chevron'
    | 'refresh'
    | 'camera'
    | 'share'
    | 'mute'
    | 'sound'
    | 'steps'
    | 'film'
    | 'path'

  const {name, size = 24}: {name: Name; size?: number} = $props()

  const paths = ({
    play: 'M8 5.5v13l11-6.5z',
    eye: 'M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z M12 15a3 3 0 100-6 3 3 0 000 6z',
    pin: 'M12 21s7-6.3 7-11a7 7 0 10-14 0c0 4.7 7 11 7 11z M12 12.5a2.5 2.5 0 100-5 2.5 2.5 0 000 5z',
    bulb: 'M9 18h6 M10 21h4 M12 3a6 6 0 00-4 10.5c.8.7 1 1.2 1 2.5h6c0-1.3.2-1.8 1-2.5A6 6 0 0012 3z',
    crosshair: 'M12 3v4 M12 17v4 M3 12h4 M17 12h4 M12 15a3 3 0 100-6 3 3 0 000 6z',
    trophy: 'M7 4h10v5a5 5 0 01-10 0zM7 6H4v1a3 3 0 003 3M17 6h3v1a3 3 0 01-3 3M10 15h4v3h-4zM8 21h8',
    timer: 'M12 21a8 8 0 100-16 8 8 0 000 16z M12 9v4l2.5 2.5 M9 2h6',
    lock: 'M6 11h12v9H6z M9 11V8a3 3 0 016 0v3',
    check: 'M4 12.5l5 5 11-11',
    x: 'M6 6l12 12M18 6L6 18',
    chevron: 'M15 6l-6 6 6 6',
    refresh: 'M4 12a8 8 0 018-8c3 0 5.5 1.7 7 4M20 4v4h-4 M20 12a8 8 0 01-8 8c-3 0-5.5-1.7-7-4M4 20v-4h4',
    camera: 'M4 8h3l1.5-2h7L18 8h3v11H3V8z M12 16a3.5 3.5 0 100-7 3.5 3.5 0 000 7z',
    share: 'M12 3v13 M8 7l4-4 4 4 M5 13v7h14v-7',
    mute: 'M4 9h4l5-4v14l-5-4H4z M16 9l5 5M21 9l-5 5',
    sound: 'M4 9h4l5-4v14l-5-4H4z M15 9a4 4 0 010 6 M18 6a8 8 0 010 12',
    steps: 'M4 20h4v-4h4v-4h4V8h4',
    film: 'M4 4h16v16H4z M8 4v16M16 4v16M4 8h4M4 16h4M16 8h4M16 16h4',
    path: 'M6 20a3 3 0 100-6 3 3 0 000 6z M6 14V8a3 3 0 013-3h6a3 3 0 013 3v0M18 5l2 2-2 2',
  }) satisfies Record<Name, string>
</script>

<svg
  width={size}
  height={size}
  viewBox="0 0 24 24"
  fill="none"
  stroke="currentColor"
  stroke-width="1.5"
  stroke-linecap="round"
  stroke-linejoin="round"
  aria-hidden="true"
>
  {#each paths[name].split(' M') as seg, i}
    <path d={i === 0 ? seg : `M${seg}`} />
  {/each}
</svg>
