/**
 * The hunt screen's DOM owner.
 *
 * The only module that writes to the signal block (label, band word, copy,
 * named-spot line, heat thumb, sonar radar), the set list, the sets chip, the
 * timer chip, and the prompt buttons. main.ts owns behaviour/events; this
 * module owns pixels.
 */
import {FILM_SPOTS, type FilmSpot} from './data/spots'
import {glide} from './heat'
import type {SpotRun} from './hunt'
import {haptics} from './haptics'
import type {ProximityVerdict} from './proximity'

// SAFETY: index.html ships every id referenced below with the matching tag;
// the single cast here owns that invariant for all $<T> call sites.
const $ = <T extends HTMLElement>(id: string): T => document.getElementById(id.replace(/^#/, '')) as T

type Band = 0 | 1 | 2 | 3 | 4

const BAND_UI: Array<{label: string; sub: string; copy: string; tone: string}> = [
  {
    label: 'Cold',
    sub: 'Shivering under the marquee',
    copy: 'A set is out there somewhere on campus. Pick a direction — the signal will sharpen.',
    tone: 'text-fog',
  },
  {
    label: 'Chilly',
    sub: 'Not far from the lobby',
    copy: 'You’re in the right neighborhood. Keep wandering — the signal will rise.',
    tone: 'text-fog',
  },
  {
    label: 'Warm',
    sub: 'Somewhere behind the curtain',
    copy: 'Getting warmer. Trust your feet — slow and steady.',
    tone: 'text-gold',
  },
  {
    label: 'Hot',
    sub: 'Right on the soundstage',
    copy: 'Very close now. Keep your eyes open.',
    tone: 'text-spotlight',
  },
  {
    label: 'You’re close',
    sub: 'Standing on a set',
    copy: 'You’re standing on a set right now.',
    tone: 'text-spotlight',
  },
]

export interface HuntPromptState {
  running: boolean
  arTarget: FilmSpot | null
  simMode: boolean
}

export function createHuntScreen() {
  const signalLabel = $('#signal-label')
  const signalBand = $('#signal-band')
  const signalCopy = $('#signal-copy')
  const signalSpot = $('#signal-spot')
  const signalRadar = $('#signal-radar')
  const heatThumb = $('#heat-thumb')
  const spotList = $('#spot-list')
  const setsChip = $('#sets-chip')
  const timerChip = $('#timer-chip')
  const huntHint = $('#hunt-hint')
  const openArBtn = $('#open-ar-btn')
  const gpsErrorBtn = $('#gps-error-btn')
  const demoHuntBtn = $('#demo-hunt-btn')

  let currentBand: Band = 0
  let heat = 0 // gliding display value (0–100)
  let targetHeat = 0

  function setRadarSpeed(): void {
    const duration = 2.6 - (heat / 100) * 1.9 // 2.6 s cold → 0.7 s blazing
    for (const ring of signalRadar.querySelectorAll<HTMLElement>('.radar-ring')) {
      ring.style.animationDuration = `${duration.toFixed(2)}s`
    }
  }

  function setBand(band: Band): void {
    const rising = band > currentBand
    currentBand = band
    const ui = BAND_UI[band]
    signalLabel.textContent = ui.label
    signalLabel.className = `font-display text-7xl leading-none tracking-wider ${ui.tone}`
    signalBand.textContent = ui.sub
    if (rising) haptics.tick() // band crossed upward — feel the warm-up
  }

  /** No fix yet — say so instead of silently sitting on "Cold". */
  function setWaiting(): void {
    heat = 0
    targetHeat = 0
    heatThumb.style.left = '0%'
    signalLabel.textContent = '···'
    signalLabel.className = 'font-display text-7xl leading-none tracking-wider text-fog'
    signalBand.textContent = 'Rolling the establishing shot'
    signalCopy.textContent = 'Getting a fix on your position — hold tight.'
    signalSpot.classList.add('hidden')
  }

  /** Paint a proximity verdict: band word, copy, named spot, heat target. */
  function renderVerdict(verdict: ProximityVerdict): void {
    targetHeat = verdict.heat
    setBand(verdict.band)

    if (verdict.namedSpot) {
      signalSpot.textContent = `Closest set on the board: ${verdict.namedSpot.name}.`
      signalSpot.classList.remove('hidden')
    } else {
      signalSpot.classList.add('hidden')
    }

    if (verdict.fuzzy) signalCopy.textContent = 'Position is still fuzzy — hold steady for a sharper read.'
    else if (verdict.band === 4)
      signalCopy.textContent = verdict.insideSpot
        ? `You’re standing on a set right now — ${verdict.insideSpot.name}.`
        : 'That’s a wrap — every set is in the can.'
    else if (verdict.farAway)
      signalCopy.textContent = 'The sets are parked on a campus kilometres from here. Run the demo flight to see the hunt.'
    else signalCopy.textContent = BAND_UI[verdict.band].copy
  }

  /** Glide the heat thumb + radar toward the target; call from the ticker. */
  function tickDisplay(): void {
    heat = glide(heat, targetHeat)
    heatThumb.style.left = `${heat.toFixed(1)}%`
    heatThumb.classList.toggle('is-blazing', heat > 85)
    setRadarSpeed()
  }

  function renderSpotList(runs: SpotRun[]): void {
    spotList.innerHTML = ''
    for (const run of runs) {
      const li = document.createElement('li')
      li.className =
        'glass flex items-center gap-3 rounded-tile px-3.5 py-2.5 motion-safe:transition-colors motion-safe:duration-300'
      const turn = FILM_SPOTS.indexOf(run.spot) + 1
      li.innerHTML = `
        <span class="font-display w-8 shrink-0 text-lg tracking-wider text-fog/50">${String(turn).padStart(2, '0')}</span>
        <div class="min-w-0 flex-1">
          <p class="font-display truncate text-xl tracking-wider text-chalk">${run.spot.name}</p>
          <p class="truncate text-[11px] text-fog">${run.spot.movie.title}</p>
        </div>
        <span class="badge"></span>`
      const badge = li.querySelector('.badge')!
      if (run.status === 'found') {
        badge.className = 'badge rounded-full border border-gold/50 bg-gold/10 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.22em] text-spotlight'
        badge.textContent = 'in the can'
      } else if (run.status === 'unlocked') {
        badge.className = 'badge rounded-full border border-ember/50 bg-ember/10 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.22em] text-gold'
        badge.textContent = 'live'
      } else {
        badge.className = 'badge rounded-full border border-line px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.22em] text-fog/60'
        badge.textContent = 'off air'
      }
      spotList.appendChild(li)
    }
    const found = runs.filter((s) => s.status === 'found').length
    setsChip.innerHTML = `Sets <span class="font-semibold text-gold">${found}/${runs.length}</span>`
  }

  function setTimer(text: string): void {
    timerChip.textContent = text
  }

  /** Prompt-button visibility + footer hint for the current hunt state. */
  function showPrompts(state: HuntPromptState): void {
    // Demo entry stays available while really hunting (hidden once sim runs
    // or a set is live — the camera CTA takes the floor).
    demoHuntBtn.classList.toggle('hidden', !state.running || state.simMode || !!state.arTarget)
    openArBtn.classList.toggle('hidden', !state.running || !state.arTarget)
    if (!state.running) return

    if (state.arTarget) {
      gpsErrorBtn.classList.add('hidden')
      huntHint.textContent = 'You’re standing on a set right now.'
    } else {
      gpsErrorBtn.classList.add('hidden')
      huntHint.textContent = 'Keep wandering — the signal will sharpen.'
    }
  }

  function prompt(mode: 'wander' | 'keep' | 'gps' | 'nofix', simMode: boolean): void {
    if (mode === 'gps') {
      gpsErrorBtn.classList.remove('hidden')
      demoHuntBtn.classList.toggle('hidden', simMode)
      huntHint.textContent = 'Location is how we sense the campus. Allow it, then try again.'
    } else if (mode === 'nofix') {
      gpsErrorBtn.classList.remove('hidden')
      demoHuntBtn.classList.remove('hidden')
      huntHint.textContent = 'No position yet — check the location permission, or run the demo flight.'
    } else {
      openArBtn.classList.add('hidden')
      gpsErrorBtn.classList.add('hidden')
      huntHint.textContent =
        mode === 'wander'
          ? 'Keep wandering — the signal will sharpen.'
          : 'One just went live, but it’ll wait. Wander where the signal points.'
    }
  }

  function hideGpsError(): void {
    gpsErrorBtn.classList.add('hidden')
  }

  return {setWaiting, renderVerdict, tickDisplay, renderSpotList, setTimer, showPrompts, prompt, hideGpsError}
}

export type HuntScreen = ReturnType<typeof createHuntScreen>
