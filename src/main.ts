/**
 * Campus Film Hunt — app orchestrator (wiring only).
 *
 * Owns: screen switching, the AR session lifecycle + hooks, location-source
 * selection (real / demo / jump), the reveal panel, and event bindings.
 * Pixels live in hunt-screen.ts / summary-screen.ts; rules live in
 * proximity.ts / heat.ts / reveal-gate.ts; state lives in hunt.ts.
 *
 * Flow: start screen → hunt (GPS warmth only) → open camera inside a spot's
 * radius → tracking locks + ≥2 s inside → reveal (3D slate + info panel) →
 * all five spots → summary (splits, name entry, stub leaderboard).
 */

import './style.css'
import {XR8Promise} from '@8thwall/engine-binary'
import {createArControl} from './ar'
import {isCameraStatusDetail} from './camera-status'
import {fireConfetti} from './confetti'
import {FILM_SPOTS, type FilmSpot, spotById} from './data/spots'
import {createHunt, formatClock, type HuntController} from './hunt'
import {createHuntScreen} from './hunt-screen'
import {haptics} from './haptics'
import {fetchLeaderboard, submitScore, type ScoreEntry} from './leaderboard'
import {
  startRealLocation,
  startSimulatedFixer,
  wantsSimulation,
  type GeoFix,
  type LocationController,
} from './location'
import {evaluateProximity, isInside} from './proximity'
import {createSummaryScreen} from './summary-screen'
import type {Xr8RealityFrameData, XrCameraStatusData} from './types/xr8'

// ------------------------------------------------------------------ DOM
// SAFETY: index.html ships every id referenced below with the matching tag;
// the single cast here owns that invariant for all $<T> call sites.
const $ = <T extends HTMLElement>(id: string): T => document.getElementById(id.replace(/^#/, '')) as T

const startScreen = $('#screen-start')
const huntScreenEl = $('#screen-hunt')
const summaryScreenEl = $('#screen-summary')
const arChrome = $('#ar-chrome')
const revealPanel = $('#reveal-panel')

const startButton = $<HTMLButtonElement>('#start-button')
const demoStartBtn = $<HTMLButtonElement>('#demo-start-btn')
const openArBtn = $<HTMLButtonElement>('#open-ar-btn')
const gpsErrorBtn = $<HTMLButtonElement>('#gps-error-btn')
const demoHuntBtn = $<HTMLButtonElement>('#demo-hunt-btn')
const demoChip = $('#demo-chip')
const envNote = $('#env-note')
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
const arTimerValue = $('#ar-timer-value')
const arHint = $('#ar-hint')
const endArBtn = $<HTMLButtonElement>('#end-ar-btn')
const recenterBtn = $<HTMLButtonElement>('#recenter-btn')
const toastEl = $('#toast')
const restartBtn = $<HTMLButtonElement>('#restart-btn')

const revealSpotName = $('#reveal-spot-name')
const revealMovie = $('#reveal-movie')
const revealBlurb = $('#reveal-blurb')
const revealSplit = $('#reveal-split')
const revealVideo = $<HTMLVideoElement>('#reveal-video')
const revealAssetRow = $('#reveal-asset-row')
const revealAsset = $('#reveal-asset')
const revealAssetLabel = $('#reveal-asset-label')
const revealKicker = $('#reveal-kicker')

// ------------------------------------------------------------------ state
const hunt: HuntController = createHunt()
const ar = createArControl()
const screen = createHuntScreen()
const summary = createSummaryScreen()

let locationCtrl: LocationController | null = null
let lastFix: GeoFix | null = null
let arTarget: FilmSpot | null = null // closest unfound spot the user is inside
let targetSpot: FilmSpot | null = null // the set the player chose to hunt (null = auto)
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
  huntScreenEl.classList.toggle('hidden', name !== 'hunt')
  huntScreenEl.classList.toggle('flex', name === 'hunt')
  summaryScreenEl.classList.toggle('hidden', name !== 'summary')
}

const spotStateLabel = (spotId: string): string =>
  hunt.spots.find((s) => s.spot.id === spotId)?.status ?? 'locked'

function showAr(spot: FilmSpot): void {
  startScreen.classList.add('hidden')
  huntScreenEl.classList.add('hidden')
  summaryScreenEl.classList.add('hidden')
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
  refreshPrompts()
}

// ------------------------------------------------------------------ proximity → screen
function applyFix(fix: GeoFix): void {
  lastFix = fix
  // A stale target (just found) falls back to auto-nearest.
  if (targetSpot && spotStateLabel(targetSpot.id) === 'found') targetSpot = null

  const verdict = evaluateProximity(fix, hunt.spots, targetSpot)

  if (verdict.insideSpot) {
    arTarget = verdict.insideSpot
    const run = hunt.spots.find((r) => r.spot.id === verdict.insideSpot?.id)
    if (run && run.status === 'locked') {
      hunt.setUnlocked(run.spot.id)
      haptics.unlock()
    }
  } else {
    arTarget = null
  }

  screen.renderVerdict(verdict)
}

function refreshTargetPicker(): void {
  screen.renderTargetPicker(hunt.spots, targetSpot?.id ?? '')
}

function refreshPrompts(): void {
  screen.showPrompts({running: hunt.status === 'in_progress', arTarget, simMode})
}

const handleFix = (fix: GeoFix): void => {
  window.clearTimeout(fixWatchdog)
  screen.hideGpsError()
  applyFix(fix)
  refreshPrompts() // the open-camera CTA may now be live
}

// ------------------------------------------------------------------ timer
let timerInterval = 0
function startTimerTicker(): void {
  window.clearInterval(timerInterval)
  timerInterval = window.setInterval(() => {
    const t = formatClock(hunt.elapsedMs())
    screen.setTimer(t)
    arTimerValue.textContent = t
    screen.tickDisplay()
  }, 100)
}
function stopTimerTicker(): void {
  window.clearInterval(timerInterval)
}

// ------------------------------------------------------------------ location
function findLocationTargets(): Array<{lat: number; lng: number}> {
  return FILM_SPOTS.map((s) => ({lat: s.lat, lng: s.lng}))
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
    screen.prompt('gps', simMode)
    return
  }

  // Honest "no data yet" state + a watchdog: if no fix lands in 10 s, offer a
  // retry and the demo flight instead of sitting silently on "Cold".
  screen.setWaiting()
  fixWatchdog = window.setTimeout(() => {
    if (lastFix === null) screen.prompt('nofix', simMode)
  }, 10000)

  locationCtrl = startRealLocation(handleFix, (code) => {
    // 1 = denied, 2 = unavailable, 3 = timeout — all dead ends without help.
    if (code === 1 || code === 2 || code === 3) {
      window.clearTimeout(fixWatchdog)
      screen.prompt('gps', simMode)
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
  screen.hideGpsError()
  showSimChrome()
  locationCtrl = startSimulatedFixer(findLocationTargets(), handleFix)
  toast('Demo flight rolling — follow the signal to each set.', 3200)
  refreshPrompts()
}

/**
 * Dev/sim: teleport the "GPS" signal to a spot and hold it there. Installs a
 * static position source, so a jump is just another adapter — every fix in
 * the app arrives through the single handleFix path.
 */
function manualJump(spot: FilmSpot): void {
  locationCtrl?.stop()
  locationCtrl = {
    start: () => undefined,
    stop: () => undefined,
    refix: () => undefined,
  }
  handleFix({lat: spot.lat, lng: spot.lng, accuracyM: 5, simulated: true})
}

// ------------------------------------------------------------------ hunt start/restart
function beginHunt(): void {
  hunt.start()
  startTimerTicker()
  startLocation()
  showOnlyScreen('hunt')
  screen.renderSpotList(hunt.spots)
  refreshTargetPicker()
  refreshPrompts()
}

let pendingScore: {name: string; totalTimeMs: number; splits: ScoreEntry['splits']} | null = null

function goToSummary(): void {
  stopTimerTicker()
  showOnlyScreen('summary')
  arTarget = null
  fireConfetti()
  haptics.fanfare()

  pendingScore = {
    name: '',
    totalTimeMs: hunt.elapsedMs(),
    splits: hunt.scoreSplits(),
  }
  renderMarquee()
}

function renderMarquee(highlightName?: string): void {
  summary.render(
    {
      totalMs: hunt.elapsedMs(),
      splits: hunt.splits().map((s) => ({
        index: s.index,
        name: s.spot.name,
        movie: s.spot.movie.title,
        ms: s.ms,
      })),
      entries: fetchLeaderboard().slice(0, 8),
    },
    highlightName,
  )
  summary.setPendingName(pendingScore?.name ?? '')
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
        ? 'You’re inside the set — hold still, the slate is about to clap.'
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
      toast('That set’s already in the can — enjoy the rerun.')
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
    haptics.clap()
    // The chosen target just wrapped → fall back to auto-nearest.
    if (targetSpot?.id === spot.id) {
      targetSpot = null
      if (!hunt.allFound()) toast('Target wrapped — the slider now tracks the nearest set.')
    }
    // Clap impact: shake the AR frame (reduced-motion users get none).
    arChrome.classList.remove('motion-safe:animate-shake')
    void arChrome.offsetWidth // restart the animation
    arChrome.classList.add('motion-safe:animate-shake')
    window.setTimeout(() => arChrome.classList.remove('motion-safe:animate-shake'), 420)
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
  revealSpotName.textContent = spot.name
  revealMovie.textContent = spot.movie.title
  revealBlurb.textContent = spot.movie.blurb
  revealSplit.textContent = formatClock(hunt.splitFor(spot.id))
  revealAsset.style.backgroundColor = spot.asset.color
  revealAssetLabel.textContent = spot.asset.label
  revealKicker.textContent = hunt.allFound() ? 'Final scene found' : 'Scene found'

  // Movie clip when one is dropped at public/clips/<id>.mp4, swatch otherwise.
  const videoUrl = spot.asset.videoUrl
  if (videoUrl) {
    revealVideo.classList.remove('hidden')
    revealAssetRow.classList.add('hidden')
    if (revealVideo.src !== new URL(videoUrl, window.location.href).href) {
      revealVideo.src = videoUrl
      revealVideo.load()
    }
    revealVideo.play().catch(() => undefined)
  } else {
    revealVideo.pause()
    revealVideo.classList.add('hidden')
    revealAssetRow.classList.remove('hidden')
  }

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
// Missing clip file → fall back to the swatch row instead of a broken player.
revealVideo.addEventListener('error', () => {
  revealVideo.pause()
  revealVideo.classList.add('hidden')
  revealAssetRow.classList.remove('hidden')
})

startButton.addEventListener('click', () => {
  haptics.tick()
  beginHunt()
})
demoStartBtn.addEventListener('click', () => {
  haptics.tick()
  beginHunt()
  startDemoFlight()
})
demoHuntBtn.addEventListener('click', startDemoFlight)
openArBtn.addEventListener('click', () => {
  haptics.tick()
  openAr()
})
endArBtn.addEventListener('click', () => {
  haptics.tick()
  endArSession()
})
recenterBtn.addEventListener('click', () => ar.recenter())
revealContinueBtn.addEventListener('click', () => {
  haptics.tick()
  endArSession()
})

gpsErrorBtn.addEventListener('click', () => {
  haptics.tick()
  // One-shot fresh fix through the active source — no parallel API path.
  if (!locationCtrl) return
  locationCtrl.refix()
  toast('Requesting a position fix…')
})

// Target picker: re-aim the slider the moment a set is chosen.
const targetSelect = $<HTMLSelectElement>('#target-select')
targetSelect.addEventListener('change', () => {
  haptics.tick()
  targetSpot = targetSelect.value ? (spotById(targetSelect.value) ?? null) : null
  if (lastFix) applyFix(lastFix) // slider re-aims instantly, no GPS wait
  refreshPrompts()
})

// Dev/sim: jump straight inside a spot's radius.
for (const btn of document.querySelectorAll<HTMLButtonElement>('#sim-rail .sim-btn')) {
  btn.addEventListener('click', () => {
    haptics.tick()
    const idx = Number(btn.dataset.sim ?? '1') - 1
    const spot = FILM_SPOTS[Math.min(Math.max(idx, 0), FILM_SPOTS.length - 1)]
    manualJump(spot)
  })
}

summary.bindPostForm(async (name) => {
  if (!pendingScore) return false
  await submitScore(name, pendingScore.totalTimeMs, pendingScore.splits)
  pendingScore.name = name
  renderMarquee(name)
  return true
})

restartBtn.addEventListener('click', () => {
  haptics.tick()
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
      screen.renderSpotList(hunt.spots)
      refreshTargetPicker()
      refreshPrompts()
      break
    case 'complete':
      goToSummary()
      break
    default:
      showOnlyScreen('start')
  }
}

hunt.onChange(() => {
  screen.renderSpotList(hunt.spots)
  refreshTargetPicker()
  if (hunt.status === 'in_progress') refreshPrompts()
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
