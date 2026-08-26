/**
 * Campus Film Hunt — app orchestrator.
 *
 * Torches the "navigation" concept from Phase 1 (no arrows, no directions) and
 * replaces it with a *coarse proximity gate* + the AR clapperboard reveal.
 *
 * Flow: start screen → hunt (GPS warmth only) → open camera inside a spot's
 * radius → tracking locks + ≥2 s inside → reveal (3D slate + info panel) →
 * all three spots → summary (splits, name entry, stub leaderboard).
 */

import './style.css'
import {XR8Promise} from '@8thwall/engine-binary'
import {createArControl} from './ar'
import {FILM_SPOTS, type FilmSpot} from './data/spots'
import {createHunt, formatClock, type HuntController} from './hunt'
import {fetchLeaderboard, submitScore, type ScoreEntry} from './leaderboard'
import {
  distanceM,
  startRealLocation,
  startSimulatedFixer,
  wantsSimulation,
  type GeoFix,
  type LocationController,
} from './location'
import type {Xr8RealityFrameData, XrCameraStatusData} from './types/xr8'
import {isCameraStatusDetail} from './camera-status'

// ------------------------------------------------------------------ DOM
// SAFETY: index.html ships every id referenced below with the matching tag;
// the single cast here owns that invariant for all $<T> call sites.
const $ = <T extends HTMLElement>(id: string): T => document.getElementById(id.replace(/^#/, '')) as T

const startScreen = $('#screen-start')
const huntScreen = $('#screen-hunt')
const summaryScreen = $('#screen-summary')
const arChrome = $('#ar-chrome')
const revealPanel = $('#reveal-panel')

const startButton = $<HTMLButtonElement>('#start-button')
const demoStartBtn = $<HTMLButtonElement>('#demo-start-btn')
const openArBtn = $<HTMLButtonElement>('#open-ar-btn')
const huntHint = $('#hunt-hint')
const gpsErrorBtn = $<HTMLButtonElement>('#gps-error-btn')
const demoHuntBtn = $<HTMLButtonElement>('#demo-hunt-btn')
const demoChip = $('#demo-chip')
const envNote = $('#env-note')
const signalLabel = $('#signal-label')
const signalBand = $('#signal-band')
const signalCopy = $('#signal-copy')
const signalSpot = $('#signal-spot')
const signalMeter = $('#signal-meter')
const spotList = $('#spot-list')
const setsChip = $('#sets-chip')
const timerChip = $('#timer-chip')
const simRail = $('#sim-rail')
const revealContinueBtn = $<HTMLButtonElement>('#reveal-continue')

const hud = {
  engine: $('#hud-engine'),
  device: $('#hud-device'),
  camera: $('#hud-camera'),
  tracking: $('#hud-tracking'),
  reason: $('#hud-reason'),
  spot: $('#hud-spot'),
  state: $('#hud-state'),
}
const arTimer = $('#ar-timer')
const arHint = $('#ar-hint')
const endArBtn = $<HTMLButtonElement>('#end-ar-btn')
const recenterBtn = $<HTMLButtonElement>('#recenter-btn')
const toastEl = $('#toast')

const summaryTotal = $('#summary-total')
const summarySplits = $('#summary-splits')
const leaderboardList = $('#leaderboard-list')
const nameForm = $<HTMLFormElement>('#name-form')
const nameInput = $<HTMLInputElement>('#name-input')
const postScoreBtn = $<HTMLButtonElement>('#post-score-btn')
const scoreStatus = $('#score-status')
const restartBtn = $<HTMLButtonElement>('#restart-btn')

const revealSpotName = $('#reveal-spot-name')
const revealMovie = $('#reveal-movie')
const revealBlurb = $('#reveal-blurb')
const revealSplit = $('#reveal-split')
const revealAsset = $('#reveal-asset')
const revealAssetLabel = $('#reveal-asset-label')
const revealKicker = $('#reveal-kicker')

// ------------------------------------------------------------------ state
const hunt: HuntController = createHunt()
const ar = createArControl()

let locationCtrl: LocationController | null = null
let lastFix: GeoFix | null = null
let arTarget: FilmSpot | null = null // closest unfound spot the user is inside
let toastTimer = 0
let alreadyFoundNotified = false
let revealFallbackTimer = 0
let fixWatchdog = 0

// Demo flights reuse the ?sim simulator; the URL param just pre-enables it.
let simMode = wantsSimulation()

// ------------------------------------------------------------------ helpers
type CameraStatusUi = {label: string; tone: '' | 'good' | 'warn' | 'bad'}

/** Engine status codes this app renders specially; everything else passes through raw. */
const CAMERA_STATUS_UI = {
  requesting: {label: 'Requesting permission…', tone: 'warn'},
  hasStream: {label: 'Stream acquired', tone: 'warn'},
  hasVideo: {label: 'Running', tone: 'warn'},
  hasDesktop3D: {label: 'Desktop 3D (dev)', tone: 'good'},
  failed: {label: 'Failed', tone: 'bad'},
  'not-allowed': {label: 'Permission denied', tone: 'bad'},
} satisfies Record<string, CameraStatusUi>

type CameraStatusKey = keyof typeof CAMERA_STATUS_UI
const isCameraStatusKey = (value: string): value is CameraStatusKey => value in CAMERA_STATUS_UI

const hudValue = (el: HTMLElement, text: string, tone: '' | 'good' | 'warn' | 'bad' = ''): void => {
  el.textContent = text
  el.classList.remove('text-spotlight', 'text-gold', 'text-ember')
  // Token-matched tone colours for the debug HUD value spans.
  if (tone === 'good') el.classList.add('text-spotlight')
  else if (tone === 'warn') el.classList.add('text-gold')
  else if (tone === 'bad') el.classList.add('text-ember')
}

const toast = (message: string, ms = 2600): void => {
  const p = toastEl.querySelector('p')!
  p.textContent = message
  toastEl.classList.remove('hidden')
  window.clearTimeout(toastTimer)
  toastTimer = window.setTimeout(() => toastEl.classList.add('hidden'), ms)
}

function showOnlyScreen(name: 'start' | 'hunt' | 'summary'): void {
  startScreen.classList.toggle('hidden', name !== 'start')
  huntScreen.classList.toggle('hidden', name !== 'hunt')
  huntScreen.classList.toggle('flex', name === 'hunt')
  summaryScreen.classList.toggle('hidden', name !== 'summary')
}

function showAr(spot: FilmSpot): void {
  startScreen.classList.add('hidden')
  huntScreen.classList.add('hidden')
  summaryScreen.classList.add('hidden')
  arChrome.classList.remove('hidden')
  revealPanel.classList.add('hidden')
  recenterBtn.hidden = false
  hudValue(hud.spot, spot.id)
  hudValue(hud.state, spotStateLabel(spot.id))
  arHint.textContent = 'Move your phone slowly to lock tracking…'
  alreadyFoundNotified = false
}

function hideAr(): void {
  arChrome.classList.add('hidden')
  revealPanel.classList.add('hidden')
  huntsActiveHint()
}

const spotStateLabel = (spotId: string): string =>
  hunt.spots.find((s) => s.spot.id === spotId)?.status ?? 'locked'

// ------------------------------------------------------------------ meter / bands
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
    copy: "You’re in the right neighborhood. Keep wandering — the signal will rise.",
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
    label: "You’re close",
    sub: 'Standing on a set',
    copy: "You’re standing on a set right now.",
    tone: 'text-spotlight',
  },
]

let currentBand: Band = 0

/** No fix yet — say so instead of silently sitting on "Cold". */
function setWaitingSignal(): void {
  signalLabel.textContent = '···'
  signalLabel.className = 'font-display text-7xl leading-none tracking-wider text-fog'
  signalBand.textContent = 'Rolling the establishing shot'
  signalCopy.textContent = 'Getting a fix on your position — hold tight.'
  signalSpot.classList.add('hidden')
  for (const seg of Array.from(signalMeter.children)) seg.classList.remove('lit')
}

function setBand(band: Band): void {
  currentBand = band
  const ui = BAND_UI[band]
  signalLabel.textContent = ui.label
  signalLabel.className = `font-display text-7xl leading-none tracking-wider ${ui.tone}`
  signalBand.textContent = ui.sub
  for (const seg of signalMeter.querySelectorAll<HTMLElement>('.segment')) {
    const lit = Number(seg.dataset.band) <= band
    seg.classList.toggle('lit', lit)
  }
}

// ------------------------------------------------------------------ proximity
const bandFromDistance = (d: number): Band => {
  if (d > 100) return 0
  if (d > 55) return 1
  if (d > 25) return 2
  return 3
}

/** True when a fix is trustworthy enough to unlock a spot. */
const reliable = (fix: GeoFix): boolean => fix.simulated || fix.accuracyM <= 60
const isInside = (fix: GeoFix, spot: FilmSpot): boolean =>
  reliable(fix) && distanceM(fix, spot.lat, spot.lng) <= spot.radiusM

function evaluateProximity(fix: GeoFix): void {
  lastFix = fix
  const unfound = hunt.spots.filter((r) => r.status !== 'found')

  if (unfound.length === 0) {
    setBand(4)
    return
  }

  const scored = unfound
    .map((r) => ({run: r, dist: distanceM(fix, r.spot.lat, r.spot.lng)}))
    .sort((a, b) => a.dist - b.dist)
  const nearest = scored[0]

  // Inside any unfound spot's radius → unlock it and offer the camera.
  if (nearest.dist <= nearest.run.spot.radiusM && reliable(fix)) {
    arTarget = nearest.run.spot
    if (nearest.run.status === 'locked') hunt.setUnlocked(nearest.run.spot.id)
    setBand(4)
  } else {
    arTarget = null
    setBand(bandFromDistance(nearest.dist))

    // Ambiguity rule: only name a spot when it is clearly the closest
    // (second-closest is >45 m behind). Otherwise stay generic.
    const second = scored[1]
    const clear = second === undefined || second.dist - nearest.dist > 45
    if (clear && nearest.dist <= 160) {
      signalSpot.textContent = `Closest set on the board: ${nearest.run.spot.name}.`
      signalSpot.classList.remove('hidden')
    } else {
      signalSpot.classList.add('hidden')
    }
  }

  if (!reliable(fix)) signalCopy.textContent = 'Position is still fuzzy — hold steady for a sharper read.'
  else if (currentBand === 4) signalCopy.textContent = `You’re standing on a set right now — ${arTarget?.name ?? ''}.`
  else if (!fix.simulated && nearest.dist > 2000)
    signalCopy.textContent = 'The sets are parked on a campus kilometres from here. Run the demo flight to see the hunt.'
  else signalCopy.textContent = BAND_UI[currentBand].copy
}

function huntsActiveHint(): void {
  const running = hunt.status === 'in_progress'
  // Demo entry stays available while really hunting (hidden once sim runs
  // or a set is live — the camera CTA takes the floor).
  demoHuntBtn.classList.toggle('hidden', !running || simMode || !!arTarget)
  openArBtn.classList.toggle('hidden', !running || !arTarget)
  if (!running) return

  if (arTarget) {
    gpsErrorBtn.classList.add('hidden')
    huntHint.textContent = "You’re standing on a set right now."
  } else {
    gpsErrorBtn.classList.add('hidden')
    huntHint.textContent = 'Keep wandering — the signal will sharpen.'
  }
}

function huntsPrompt(mode: 'wander' | 'keep' | 'gps'): void {
  if (mode === 'gps') {
    gpsErrorBtn.classList.remove('hidden')
    demoHuntBtn.classList.toggle('hidden', simMode)
    huntHint.textContent = 'Location is how we sense the campus. Allow it, then try again.'
  } else {
    openArBtn.classList.add('hidden')
    gpsErrorBtn.classList.add('hidden')
    huntHint.textContent =
      mode === 'wander'
        ? 'Keep wandering — the signal will sharpen.'
        : "One just went live, but it’ll wait. Wander where the signal points."
  }
}

// ------------------------------------------------------------------ spot list UI
function renderSpotList(): void {
  spotList.innerHTML = ''
  for (const run of hunt.spots) {
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
  const found = hunt.spots.filter((s) => s.status === 'found').length
  setsChip.innerHTML = `Sets <span class="font-semibold text-gold">${found}/${hunt.spots.length}</span>`
}

// ------------------------------------------------------------------ timer
let timerInterval = 0
function startTimerTicker(): void {
  window.clearInterval(timerInterval)
  timerInterval = window.setInterval(() => {
    const t = formatClock(hunt.elapsedMs())
    timerChip.textContent = t
    arTimer.textContent = t
  }, 100)
}
function stopTimerTicker(): void {
  window.clearInterval(timerInterval)
}

// ------------------------------------------------------------------ location
function findLocationTargets(): Array<{lat: number; lng: number}> {
  return FILM_SPOTS.map((s) => ({lat: s.lat, lng: s.lng}))
}

const handleFix = (fix: GeoFix): void => {
  window.clearTimeout(fixWatchdog)
  gpsErrorBtn.classList.add('hidden')
  evaluateProximity(fix)
  huntsActiveHint() // the open-camera CTA may now be live
}

function showSimChrome(): void {
  simRail.classList.remove('hidden')
  simRail.classList.add('flex')
  demoChip.classList.remove('hidden')
}

function startLocation(): void {
  if (simMode) {
    showSimChrome()
    locationCtrl = startSimulatedFixer(findLocationTargets(), handleFix)
    return
  }

  if (!navigator.geolocation) {
    huntsPrompt('gps')
    return
  }

  // Honest "no data yet" state + a watchdog: if no fix lands in 10 s, offer a
  // retry and the demo flight instead of sitting silently on "Cold".
  setWaitingSignal()
  fixWatchdog = window.setTimeout(() => {
    if (lastFix === null) {
      gpsErrorBtn.classList.remove('hidden')
      huntHint.textContent = 'No position yet — check the location permission, or run the demo flight.'
      demoHuntBtn.classList.remove('hidden')
    }
  }, 10000)

  locationCtrl = startRealLocation(handleFix, (code) => {
    // 1 = denied, 2 = unavailable, 3 = timeout — all dead ends without help.
    if (code === 1 || code === 2 || code === 3) {
      window.clearTimeout(fixWatchdog)
      huntsPrompt('gps')
    }
  })
}

/**
 * Demo flight: run the same simulated GPS feed the ?sim URL uses, so the full
 * hunt (warmth → camera → reveal → summary) is demoable far from campus.
 */
function startDemoFlight(): void {
  simMode = true
  window.clearTimeout(fixWatchdog)
  locationCtrl?.stop()
  gpsErrorBtn.classList.add('hidden')
  showSimChrome()
  locationCtrl = startSimulatedFixer(findLocationTargets(), handleFix)
  toast('Demo flight rolling — follow the signal to each set.', 3200)
  huntsActiveHint()
}

/**
 * Dev/sim: teleport the "GPS" signal to a spot and hold it there. Stops the
 * auto-drift simulator so manual testing stays deterministic.
 */
function manualJump(spot: FilmSpot): void {
  locationCtrl?.stop()
  locationCtrl = null
  evaluateProximity({lat: spot.lat, lng: spot.lng, accuracyM: 5, simulated: true})
  huntsActiveHint()
}

// ------------------------------------------------------------------ hunt start/restart
function beginHunt(): void {
  hunt.start()
  startTimerTicker()
  startLocation()
  showOnlyScreen('hunt')
  renderSpotList()
  huntsActiveHint()
}

let pendingScore: {name: string; totalTimeMs: number; splits: ScoreEntry['splits']} | null = null

function goToSummary(): void {
  stopTimerTicker()
  showOnlyScreen('summary')
  arTarget = null

  summaryTotal.textContent = formatClock(hunt.elapsedMs())

  const runs = [...hunt.spots].sort((a, b) => (a.foundAtMs ?? 0) - (b.foundAtMs ?? 0))
  summarySplits.innerHTML = ''
  for (const run of runs) {
    if (run.foundAtMs === null) continue
    const li = document.createElement('li')
    li.className = 'glass flex items-center gap-3 rounded-tile px-3.5 py-3'
    li.innerHTML = `
      <span class="grid h-9 w-9 place-items-center rounded-chip bg-gold/10 font-display text-lg text-gold">${String(FILM_SPOTS.indexOf(run.spot) + 1)}</span>
      <div class="min-w-0 flex-1">
        <p class="font-display truncate text-xl tracking-wider text-chalk">${run.spot.name}</p>
        <p class="truncate text-[11px] text-fog">${run.spot.movie.title}</p>
      </div>
      <p class="font-display shrink-0 text-2xl tracking-wider text-spotlight">${formatClock(run.splitMs ?? 0)}</p>`
    summarySplits.appendChild(li)
  }

  pendingScore = {
    name: '',
    totalTimeMs: hunt.elapsedMs(),
    splits: hunt.spots
      .filter((s) => s.foundAtMs !== null && s.splitMs !== null)
      .map((s) => ({
        spotId: s.spot.id,
        spotName: s.spot.name,
        timeMs: s.splitMs!,
      })),
  }
  renderLeaderboard()
}

function renderLeaderboard(highlightName?: string): void {
  leaderboardList.innerHTML = ''
  for (const [i, entry] of fetchLeaderboard().slice(0, 8).entries()) {
    const li = document.createElement('li')
    const highlighted = highlightName !== undefined && entry.name === highlightName
    li.className =
      'flex items-center gap-3 px-4 py-2.5 ' +
      (highlighted ? 'bg-gold/10' : '')
    li.innerHTML = `
      <span class="w-6 font-display text-lg text-fog/60">${i + 1}</span>
      <span class="min-w-0 flex-1 truncate font-semibold text-chalk">${escapeHtml(entry.name)}</span>
      ${entry.splits.length ? `<span class="text-[10px] font-bold uppercase tracking-widest text-fog">${entry.splits.length}/3 sets</span>` : ''}
      <span class="font-display text-xl tracking-wider text-spotlight">${formatClock(entry.totalTimeMs)}</span>`
    leaderboardList.appendChild(li)
  }
  nameInput.value = pendingScore?.name ?? ''
}

// ------------------------------------------------------------------ AR hooks
const inRange = (): boolean => {
  if (!lastFix || !arTarget) return false
  return isInside(lastFix, arTarget)
}

const arHooks = {
  inRange,
  onTracking(reality?: Xr8RealityFrameData): void {
    const status = reality?.trackingStatus
    if (status) {
      hudValue(hud.tracking, status, status === 'NORMAL' ? 'good' : status === 'LIMITED' ? 'warn' : 'bad')
      hudValue(hud.reason, reality?.trackingReason && reality.trackingReason !== 'UNSPECIFIED' ? reality.trackingReason : '—')
    }
    if (status === 'NORMAL') {
      arHint.textContent = inRange()
        ? "You’re inside the set — hold still, the slate is about to clap."
        : 'Step back into the set’s glow to trigger the reveal.'
    } else if (status === 'LIMITED') {
      arHint.textContent = 'Still finding the room — keep the phone steady.'
    }
    // Re-entering an already-found spot: never re-reveal, just say so.
    const activeSpot = ar.getActiveSpot()
    if (
      status === 'NORMAL' &&
      activeSpot &&
      spotStateLabel(activeSpot.id) === 'found' &&
      inRange() &&
      !alreadyFoundNotified
    ) {
      alreadyFoundNotified = true
      toast("That set’s already in the can — enjoy the rerun.")
    }
  },

  onCameraStatus(status: XrCameraStatusData): void {
    const raw = (isCameraStatusDetail(status) ? status.status : status) ?? 'unknown'
    const entry = isCameraStatusKey(raw) ? CAMERA_STATUS_UI[raw] : {label: raw, tone: '' as const}
    hudValue(hud.camera, entry.label, entry.tone)
    if (entry.tone === 'bad') toast('Camera access is needed to catch the reveal.')
  },

  onReveal(spot: FilmSpot): void {
    hunt.reveal(spot.id)
    hudValue(hud.state, 'found', 'good')
    toast(`Scene found — ${spot.name}.`)
    // If this was the final set, the continue button becomes "see results".
    revealContinueBtn.querySelector('span')!.textContent = hunt.allFound() ? 'See your results' : 'Back to the hunt'
    // Safety net: the panel opens on the in-scene timeline (~1.25 s), but open
    // it anyway if rendering stalls (helps degraded devices + headless testing).
    window.clearTimeout(revealFallbackTimer)
    revealFallbackTimer = window.setTimeout(() => {
      if (revealPanel.classList.contains('hidden')) openRevealPanel(spot)
    }, 1800)
  },

  onPanelOpen(spot: FilmSpot): void {
    openRevealPanel(spot)
  },

  onError(message: string): void {
    toast(`AR hiccup: ${message}`)
    endArSession()
  },
}

function openRevealPanel(spot: FilmSpot): void {
  window.clearTimeout(revealFallbackTimer)
  const run = hunt.spots.find((r) => r.spot.id === spot.id)
  revealSpotName.textContent = spot.name
  revealMovie.textContent = spot.movie.title
  revealBlurb.textContent = spot.movie.blurb
  revealSplit.textContent = formatClock(run?.splitMs ?? 0)
  revealAsset.style.backgroundColor = spot.asset.color
  revealAssetLabel.textContent = spot.asset.label
  revealKicker.textContent = hunt.allFound() ? 'Final scene found' : 'Scene found'
  revealPanel.classList.remove('hidden')
}

// ------------------------------------------------------------------ AR session
function openAr(): void {
  if (!arTarget) return
  showAr(arTarget)
  ar.start(arTarget, arHooks)
}

function endArSession(): void {
  window.clearTimeout(revealFallbackTimer)
  ar.stop()
  hideAr()
  if (hunt.allFound()) {
    goToSummary()
  } else {
    showOnlyScreen('hunt')
  }
}

// ------------------------------------------------------------------ events
startButton.addEventListener('click', beginHunt)
demoStartBtn.addEventListener('click', () => {
  beginHunt()
  startDemoFlight()
})
demoHuntBtn.addEventListener('click', startDemoFlight)
openArBtn.addEventListener('click', openAr)
endArBtn.addEventListener('click', endArSession)
recenterBtn.addEventListener('click', () => ar.recenter())
revealContinueBtn.addEventListener('click', endArSession)

gpsErrorBtn.addEventListener('click', () => {
  if (!navigator.geolocation) return
  navigator.geolocation.getCurrentPosition(
    (pos) => {
      lastFix = {lat: pos.coords.latitude, lng: pos.coords.longitude, accuracyM: pos.coords.accuracy, simulated: false}
      evaluateProximity(lastFix)
      huntsActiveHint()
    },
    () => undefined,
    {enableHighAccuracy: true, timeout: 12000},
  )
  toast('Requesting a position fix…')
})

// Dev/sim: jump straight inside a spot's radius.
for (const btn of document.querySelectorAll<HTMLButtonElement>('#sim-rail .sim-btn')) {
  btn.addEventListener('click', () => {
    const idx = Number(btn.dataset.sim ?? '1') - 1
    const spot = FILM_SPOTS[Math.min(Math.max(idx, 0), FILM_SPOTS.length - 1)]
    manualJump(spot)
  })
}

nameForm.addEventListener('submit', (e) => {
  e.preventDefault()
  if (!pendingScore) return
  const name = nameInput.value.trim()
  if (!name) {
    scoreStatus.textContent = 'The marquee needs a name.'
    scoreStatus.classList.remove('hidden')
    return
  }
  postScoreBtn.disabled = true
  postScoreBtn.textContent = 'Posting…'
  const score = pendingScore
  const total = score.totalTimeMs
  const splits = score.splits
  submitScore(name, total, splits).then(() => {
    postScoreBtn.disabled = false
    postScoreBtn.textContent = 'Post'
    scoreStatus.textContent = `Posted — you’re on the marquee, ${name}.`
    score.name = name
    renderLeaderboard(name)
  })
})

restartBtn.addEventListener('click', () => {
  window.sessionStorage.removeItem('campus-film-hunt:v1')
  window.location.reload()
})

// ------------------------------------------------------------------ debug HUD
hudValue(hud.device, /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent) ? 'mobile' : 'desktop')
XR8Promise.then((xr8) => hudValue(hud.engine, `3D AR v${xr8.version()}`)).catch(() => {
  hudValue(hud.engine, 'engine not loaded', 'bad')
})

// In-app browsers (social-app webviews, custom tabs) frequently block
// geolocation and camera — warn before the hunt dead-ends.
const inAppBrowser =
  /FBAN|FBAV|FBSV|Instagram|Discord|Line\/|Snapchat|musical_ly|Bytedance|Twitter|TikTok/i.test(navigator.userAgent)
if (inAppBrowser) {
  envNote.textContent =
    'Heads up: in-app browsers often block camera + GPS. Open this link in Chrome or Safari for the full hunt.'
  envNote.classList.remove('hidden')
}

// ------------------------------------------------------------------ boot/resume
function boot(): void {
  switch (hunt.status) {
    case 'in_progress':
      startTimerTicker()
      startLocation()
      showOnlyScreen('hunt')
      renderSpotList()
      huntsActiveHint()
      break
    case 'complete':
      goToSummary()
      break
    default:
      showOnlyScreen('start')
  }
}

hunt.onChange(() => {
  renderSpotList()
  if (hunt.status === 'in_progress') huntsActiveHint()
})

boot()

// Headless smoke-test / demo hook — dev & sim only, so real deployments
// can't cheat the (stubbed) leaderboard by forcing reveals.
if (simMode || import.meta.env.DEV) {
  Object.assign(window, {
    __campushunt: {
      jump: (spotId: string) => {
        const spot = FILM_SPOTS.find((s) => s.id === spotId)
        if (spot) manualJump(spot)
      },
      reveal: () => ar.forceReveal(),
      openAr: () => openAr(),
    },
  })
}

// Small XSS guard for leaderboard names.
function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (c) => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'})[c]!)
}