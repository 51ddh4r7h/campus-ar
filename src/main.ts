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
import type {ArControl} from './ar'
import {isCameraStatusDetail} from './camera-status'
import {fireConfetti} from './confetti'
import {FILM_SPOTS, type FilmSpot, spotById} from './data/spots'
import {createHunt, formatClock, type HuntController} from './hunt'
import {bandLabel, createHuntScreen} from './hunt-screen'
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
import {bindOrientationRecenter} from './orientation-recenter'
import {getNetworkConnection} from './network'
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

// AR hunt surface
const debugHud = $('#debug-hud')
const reticle = $('#ar-reticle')
const calibrationBox = $('#ar-calibration')
const calibrationTitle = $('#ar-calibration-title')
const calibrationSub = $('#ar-calibration-sub')
const lostOverlay = $('#ar-lost')
const lockedFlash = $('#ar-locked-flash')
const arSignalWord = $('#ar-signal-word')
const arHeatFill = $('#ar-heat-fill')
const arHeatThumb = $('#ar-heat-thumb')
const arRadar = $('#ar-radar')
const arSignalCopy = $('#ar-signal-copy')
const arProgress = $('#ar-progress')
const arProgressCount = $('#ar-progress-count')
const arStateCopy = $('#ar-state-copy')
const arBottomBar = $('#ar-bottom-bar')

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
const endArBtn = $<HTMLButtonElement>('#end-ar-btn')
const recenterBtn = $<HTMLButtonElement>('#recenter-btn')
const arSetlistBtn = $<HTMLButtonElement>('#ar-setlist-btn')
const huntTitle = $<HTMLElement>('#hunt-title')
const huntSheetCloseBtn = $<HTMLButtonElement>('#hunt-sheet-close')
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
const screen = createHuntScreen()
const summary = createSummaryScreen()

let locationCtrl: LocationController | null = null
let lastFix: GeoFix | null = null
let arTarget: FilmSpot | null = null // closest unfound spot the user is inside
let targetSpot: FilmSpot | null = null // the set the player chose to hunt (null = auto)
let lastPortalSpotId: string | null = null
let toastTimer = 0
let alreadyFoundNotified = false
let revealFallbackTimer = 0
let fixWatchdog = 0
let arControlsQuietTimer = 0
let revealVideoFallbackUrl: string | null = null
let revealReturnFocus: HTMLElement | null = null
const revealBackground = [startScreen, huntScreenEl, arChrome, summaryScreenEl]

function setRevealModalState(open: boolean): void {
  for (const element of revealBackground) element.inert = open
}

// Load the AR stack only when the player enters the camera. These pending
// values preserve demo/location state while the async module initializes.
let ar: ArControl | null = null
let arLoad: Promise<ArControl> | null = null
type SignalLevel = Parameters<ArControl['setSignal']>[0]
let pendingArSignal: SignalLevel = 0
let pendingArLabel = {name: '', sub: ''}
let pendingPortalSpot: FilmSpot | null = null

function loadAr(): Promise<ArControl> {
  if (!arLoad) {
    arLoad = import('./ar').then(({createArControl}) => {
      const controller = createArControl()
      ar = controller
      setRcaXr8State('resolved ✓')
      hudValue(hud.engine, '3D AR ready', 'good')
      return controller
    })
  }
  return arLoad
}

function setArSignal(level: SignalLevel): void {
  pendingArSignal = level
  ar?.setSignal(level)
}

function setArLabel(name: string, sub: string): void {
  pendingArLabel = {name, sub}
  ar?.setLabel(name, sub)
}

type ArExperienceState = 'preparing' | 'searching' | 'warming' | 'appearing' | 'discovered' | 'tracking-lost'

function setArExperienceState(state: ArExperienceState, copy: string): void {
  const changed = arChrome.dataset.state !== state
  arChrome.dataset.state = state
  arStateCopy.textContent = copy
  if (changed) wakeArControls()
}

function wakeArControls(): void {
  arBottomBar.dataset.quiet = 'false'
  window.clearTimeout(arControlsQuietTimer)
  arControlsQuietTimer = window.setTimeout(() => {
    if (!arChrome.classList.contains('hidden') && !huntSheetOpen && revealPanel.classList.contains('hidden')) {
      arBottomBar.dataset.quiet = 'true'
    }
  }, 4500)
}

function showArPortal(spot: FilmSpot): void {
  pendingPortalSpot = spot
  ar?.showPortal(spot)
}

function hideArPortal(): void {
  pendingPortalSpot = null
  ar?.hidePortal()
}

// Demo flights reuse the ?sim simulator; the URL param just pre-enables it.
let simMode = wantsSimulation()
const debugEnabled = import.meta.env.DEV && new URLSearchParams(window.location.search).has('debug')

// ------------------------------------------------------------------ RCA debug — always visible when ?debug (read-only, no placement logic)
let rcaHuntStartMs: number | null = null
function updateRcaWorldLock(): void {
  const el = document.getElementById('rca-worldlock')
  if (!el) return
  if (!debugEnabled) return
  const inAr = !arChrome.classList.contains('hidden')
  if (!inAr || rcaHuntStartMs === null) {
    el.textContent = `worldLocked=${worldLocked} (hunt not started)`
    return
  }
  const secs = ((performance.now() - rcaHuntStartMs) / 1000).toFixed(1)
  if (worldLocked) el.textContent = `true — locked after ${secs}s`
  else el.textContent = `false — ${secs}s since hunt start (still STARTING CAMERA)`
}
function setRcaCameraStatus(raw: string): void {
  // rcaCameraStatus raw
  const el = document.getElementById('rca-camera')
  if (el && debugEnabled) el.textContent = raw
}
function setRcaXr8State(state: string): void {
  // rcaXr8State state
  const el = document.getElementById('rca-xr8')
  if (el && debugEnabled) el.textContent = state
}
// Show RCA overlay when ?debug
if (debugEnabled) {
  const rcaEl = document.getElementById('rca-debug')
  if (rcaEl) rcaEl.classList.remove('hidden')
  setInterval(updateRcaWorldLock, 200)
}
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
  if (name === 'hunt') {
    huntScreenEl.dataset.view = arChrome.classList.contains('hidden') ? 'dashboard' : 'sheet'
  } else {
    delete huntScreenEl.dataset.view
  }
  summaryScreenEl.classList.toggle('hidden', name !== 'summary')
  const headingId = name === 'start' ? 'start-title' : name === 'hunt' ? 'hunt-title' : 'summary-title'
  window.requestAnimationFrame(() => document.getElementById(headingId)?.focus())
}

const spotStateLabel = (spotId: string): string =>
  hunt.spots.find((s) => s.spot.id === spotId)?.status ?? 'locked'

// ------------------------------------------------------------------ AR hunt flow (spec §5, §8)
let worldLocked = false
let lastNormalAt = 0
let lockedFlashTimer = 0
let huntSheetOpen = false
let huntSheetReturnFocus: HTMLElement | null = null
let sheetOffset = 0
let sheetAnimationFrame = 0
let sheetWasDragged = false

const setSheetOffset = (offset: number): void => {
  sheetOffset = Math.max(0, offset)
  huntScreenEl.style.setProperty('--sheet-offset', `${sheetOffset.toFixed(2)}px`)
}

const stopSheetAnimation = (): void => {
  window.cancelAnimationFrame(sheetAnimationFrame)
  sheetAnimationFrame = 0
}

const animateSheetTo = (target: number, initialVelocity = 0, onComplete?: () => void): void => {
  stopSheetAnimation()
  huntScreenEl.dataset.dragging = 'true'
  let velocity = initialVelocity
  let previous = performance.now()
  const step = (now: number): void => {
    const dt = Math.min(0.032, Math.max(0.001, (now - previous) / 1000))
    previous = now
    // Critically damped spring: fast enough to feel direct, without a
    // distracting bounce on a utility sheet.
    const acceleration = (target - sheetOffset) * 52 - velocity * 15
    velocity += acceleration * dt
    setSheetOffset(sheetOffset + velocity * dt)
    if (Math.abs(target - sheetOffset) < 0.5 && Math.abs(velocity) < 4) {
      setSheetOffset(target)
      huntScreenEl.dataset.dragging = 'false'
      sheetAnimationFrame = 0
      onComplete?.()
      return
    }
    sheetAnimationFrame = window.requestAnimationFrame(step)
  }
  sheetAnimationFrame = window.requestAnimationFrame(step)
}

function setHuntSheet(open: boolean): void {
  stopSheetAnimation()
  huntSheetOpen = open
  huntScreenEl.classList.toggle('hidden', !open)
  huntScreenEl.classList.toggle('flex', open)
  huntScreenEl.dataset.view = open ? 'sheet' : 'dashboard'
  huntScreenEl.dataset.dragging = 'false'
  setSheetOffset(0)
  if (open || !arChrome.classList.contains('hidden')) wakeArControls()
  arSetlistBtn.setAttribute('aria-expanded', String(open))

  if (open) {
    huntScreenEl.setAttribute('role', 'dialog')
    huntScreenEl.setAttribute('aria-modal', 'true')
    huntSheetReturnFocus = document.activeElement instanceof HTMLElement ? document.activeElement : arSetlistBtn
    window.requestAnimationFrame(() => huntTitle.focus())
    return
  }

  huntScreenEl.removeAttribute('role')
  huntScreenEl.removeAttribute('aria-modal')
  huntSheetReturnFocus?.focus()
  huntSheetReturnFocus = null
}

function setReticle(state: 'searching' | 'tracking' | 'nearby' | 'reveal'): void {
  reticle.dataset.state = state
}

/** The camera becomes the application (spec §5): hide screens, open AR. */
async function enterAr(): Promise<void> {
  setHuntSheet(false)
  startScreen.classList.add('hidden')
  huntScreenEl.classList.add('hidden')
  summaryScreenEl.classList.add('hidden')
  arChrome.classList.remove('hidden')
  wakeArControls()
  setArExperienceState('preparing', 'Preparing camera')
  revealPanel.classList.add('hidden')

  // Debug HUD is dev-only, never on demo flights (spec §25 — screenshots flagged this).
  debugHud.classList.toggle('hidden', !import.meta.env.DEV)

  // Calibration state A — camera starting (spec §8).
  worldLocked = false
  setReticle('searching')
  calibrationTitle.textContent = 'STARTING CAMERA'
  calibrationSub.textContent = 'Give the app a moment — the viewfinder will guide you.'
  calibrationBox.classList.remove('hidden')
  lostOverlay.classList.add('hidden')

  alreadyFoundNotified = false
  let controller: ArControl
  try {
    controller = await loadAr()
  } catch (cause: unknown) {
    const message = cause instanceof Error ? cause.message : String(cause)
    setRcaXr8State(`rejected: ${message}`)
    toast(`AR could not start: ${message}`)
    return
  }
  // The user may have exited while the AR module was loading.
  if (arChrome.classList.contains('hidden')) return
  controller.start(arHooks)
  controller.setSignal(pendingArSignal)
  controller.setLabel(pendingArLabel.name, pendingArLabel.sub)
  if (pendingPortalSpot) controller.showPortal(pendingPortalSpot)
  if (lastFix) applyFix(lastFix)
}

/** ✕ — leave the camera; the hunt keeps running on the dashboard. */
function exitAr(): void {
  window.clearTimeout(arControlsQuietTimer)
  arBottomBar.dataset.quiet = 'false'
  setHuntSheet(false)
  ar?.stop()
  lastPortalSpotId = null
  arChrome.classList.add('hidden')
  revealPanel.classList.add('hidden')
  window.clearTimeout(lockedFlashTimer)
  if (hunt.allFound()) {
    goToSummary()
    return
  }
  showOnlyScreen('hunt')
  refreshPrompts()
}

function flashWorldLocked(): void {
  lockedFlash.classList.remove('hidden')
  lockedFlash.classList.add('flex')
  window.clearTimeout(lockedFlashTimer)
  lockedFlashTimer = window.setTimeout(() => {
    lockedFlash.classList.add('hidden')
    lockedFlash.classList.remove('flex')
  }, 1400)
}

/** Film-reel progress dots + take counter (spec §21). */
function renderProgress(): void {
  const found = hunt.spots.filter((s) => s.status === 'found').length
  arProgress.innerHTML = hunt.spots
    .map(
      (s) =>
        `<span class="reel-dot${s.status === 'found' ? ' lit' : ''}" aria-hidden="true"></span>`,
    )
    .join('')
  arProgressCount.textContent = `${String(found).padStart(2, '0')}/${String(hunt.spots.length).padStart(2, '0')}`
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

  // Signal-reactive AR + the in-camera signal chip (spec §15).
  setArSignal(verdict.band)
  arSignalWord.textContent = bandLabel(verdict.band).toUpperCase()
  arHeatFill.style.width = `${verdict.heat.toFixed(0)}%`
  arHeatThumb.style.left = `${verdict.heat.toFixed(1)}%`
  arHeatThumb.classList.toggle('is-blazing', verdict.heat > 85)
  if (arRadar) {
    const d = 2.6 - (verdict.heat / 100) * 1.9
    for (const ring of arRadar.querySelectorAll<HTMLElement>('.radar-ring')) ring.style.animationDuration = `${d.toFixed(2)}s`
  }
  if (verdict.fuzzy) arSignalCopy.textContent = 'Position is still fuzzy — hold steady for a sharper read.'
  else if (verdict.band === 4) arSignalCopy.textContent = verdict.insideSpot ? `You’re at ${verdict.insideSpot.name}.` : 'All locations found.'
  else if (verdict.farAway) arSignalCopy.textContent = 'The sets are parked on a campus kilometres from here. Run the demo flight to see the hunt.'
  else if (verdict.band === 0) arSignalCopy.textContent = 'A set is out there somewhere on campus. Pick a direction — the signal will sharpen.'
  else if (verdict.band === 1) arSignalCopy.textContent = 'You’re in the right neighborhood. Keep wandering — the signal will rise.'
  else if (verdict.band === 2) arSignalCopy.textContent = 'Getting warmer. Trust your feet — slow and steady.'
  else arSignalCopy.textContent = 'Very close now. Keep your eyes open.'
  arSignalWord.classList.toggle('heat-warm', verdict.band === 2)
  arSignalWord.classList.toggle('heat-hot', verdict.band >= 3)
  const labelSpot = verdict.band >= 3 ? targetSpot ?? verdict.namedSpot : null
  setArLabel(
    labelSpot ? labelSpot.name.toUpperCase() : '',
    verdict.band >= 4 ? 'ON SET' : verdict.band >= 3 ? 'HOT' : verdict.band >= 2 ? 'WARM' : 'SIGNAL',
  )
  // Film-set portal centerpiece — appears when HOT.
  // Demo/?sim must show even before SLAM WORLD LOCKED, otherwise test/demo reads as vanished.
  const dbgPortal = document.getElementById('portal-debug')
  const shouldShowPortal = verdict.band >= 3 && !hunt.allFound() && (worldLocked || simMode)
  if (dbgPortal && debugEnabled && verdict.band >= 3) {
    dbgPortal.classList.remove('hidden')
  }
  const portalFor = shouldShowPortal ? (verdict.insideSpot ?? targetSpot ?? verdict.namedSpot) : null
  // RCA log — on every frame while YOU'RE CLOSE is shown, so mobile can report why ar.showPortal wasn't called
  if (verdict.band >= 3) {
    const didCall = !!portalFor && lastPortalSpotId !== portalFor.id
    console.log(`[RCA] verdict.band:${verdict.band} shouldShowPortal:${shouldShowPortal} portalFor:${portalFor?.id ?? 'null'} didCallShow:${didCall} lastId:${lastPortalSpotId ?? 'null'} worldLocked:${worldLocked} sim:${simMode} hasSpot:${!!verdict.insideSpot}`)
  }
  if (portalFor) {
    // Force show if portal is not visible (handles case where show was called but portal still hidden due to spawned false)
    const needsShow = lastPortalSpotId !== portalFor.id
    if (needsShow) {
      showArPortal(portalFor)
      lastPortalSpotId = portalFor.id
    }
  } else if (lastPortalSpotId !== null) {
    hideArPortal()
    lastPortalSpotId = null
  }
  if (verdict.band >= 3 && worldLocked) setReticle('nearby')
  if (verdict.band >= 3) setArExperienceState('appearing', 'The screen is appearing')
  else if (verdict.band === 2) setArExperienceState('warming', 'Getting close')
  else setArExperienceState('searching', 'Search around you')
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
  // Haywire fix: if user Jump-locked to a spot, pin the fix there so the
  // heat bar stays HOT and doesn't yo-yo as a stray simulated drift sneaks in.
  if (demoLockedSpotId) {
    const locked = spotById(demoLockedSpotId)
    if (locked) fix = {lat: locked.lat, lng: locked.lng, accuracyM: 5, simulated: true}
  }
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
  arHeatThumb.style.left = '0%'
  arHeatFill.style.width = '0%'
  arSignalCopy.textContent = 'Getting a fix on your position — hold tight.'
  arSignalWord.textContent = '···'
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
  demoLockedSpotId = null
  simMode = true
  window.clearTimeout(fixWatchdog)
  locationCtrl?.stop()
  screen.hideGpsError()
  showSimChrome()
  locationCtrl = startSimulatedFixer(findLocationTargets(), handleFix)
  toast('Demo ready — choose a mystery or tap a jump button.', 3200)
  refreshPrompts()
}

let demoLockedSpotId: string | null = null

/**
 * Dev/sim: teleport the "GPS" signal to a spot and hold it there. Installs a
 * static position source, so a jump is just another adapter — every fix in
 * the app arrives through the single handleFix path. Locks the signal so the
 * demo drift doesn't yank the slider back — the haywire fix.
 */
function manualJump(spot: FilmSpot): void {
  demoLockedSpotId = spot.id
  locationCtrl?.stop()
  locationCtrl = {
    start: () => undefined,
    stop: () => undefined,
    refix: () => undefined,
  }
  // Mock Jump must always go HOT — bypass proximity which may be COLD if spot already found
  // Force the portal and signal directly so demo always shows the clip
  showArPortal(spot)
  lastPortalSpotId = spot.id
  setArSignal(4)
  setArLabel(spot.name.toUpperCase(), 'ON SET')
  arTarget = spot
  const run = hunt.spots.find(r => r.spot.id === spot.id)
  if (run && run.status === 'locked') hunt.setUnlocked(spot.id)
  // Also drive the normal heat path for consistency
  handleFix({lat: spot.lat, lng: spot.lng, accuracyM: 5, simulated: true})
  // Ensure heat bar goes HOT even if proximity would say COLD (e.g. spot already found)
  arSignalWord.textContent = 'YOU’RE CLOSE'
  arHeatFill.style.width = '100%'
  arHeatThumb.style.left = '100%'
  arHeatThumb.classList.add('is-blazing')
  console.log(`[manualJump] locked to ${spot.id} forced HOT`)
}

// ------------------------------------------------------------------ hunt start/restart
function beginHunt(): void {
  hunt.start()
  rcaHuntStartMs = performance.now()
  // Also ensure portal debug is visible in AR even if hunt was already in_progress
  const rcaEl2 = document.getElementById('rca-debug')
  if (rcaEl2 && debugEnabled) rcaEl2.classList.remove('hidden')
  updateRcaWorldLock()
  startTimerTicker()
  startLocation()
  renderProgress()
  showOnlyScreen('hunt')
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
  revealSpot: (): FilmSpot | null => arTarget,

  onTracking(reality?: Xr8RealityFrameData): void {
    const status = reality?.trackingStatus
    if (status) {
      hudValue(hud.tracking, status, status === 'NORMAL' ? 'good' : status === 'LIMITED' ? 'warn' : 'bad')
      hudValue(hud.reason, reality?.trackingReason && reality.trackingReason !== 'UNSPECIFIED' ? reality.trackingReason : '—')
    }

    // Calibration + tracking-loss UX in player language (spec §8, §24).
    if (status === 'NORMAL') {
      lastNormalAt = performance.now()
      if (!arTarget) setArExperienceState('searching', 'Search around you')
      if (!worldLocked) {
        // State C — world locked (spec §8).
        worldLocked = true
        calibrationBox.classList.add('hidden')
        lostOverlay.classList.add('hidden')
        flashWorldLocked()
        setReticle(arTarget ? 'nearby' : 'tracking')
        setArLabel('', 'SIGNAL')
      } else {
        if (!lostOverlay.classList.contains('hidden')) {
          lostOverlay.classList.add('hidden')
          flashWorldLocked()
        }
      setReticle(arTarget ? 'nearby' : 'tracking')
      }
    } else if (worldLocked && performance.now() - lastNormalAt > 2000) {
      lostOverlay.classList.remove('hidden')
      setReticle('searching')
      setArExperienceState('tracking-lost', 'Tracking is taking a moment')
      // Surface the inline recenter prompt when tracking is stale — "why is this crooked" becomes obvious
      const prompt = document.getElementById('ar-recenter-prompt')
      if (prompt && prompt.classList.contains('hidden') && !arChrome.classList.contains('hidden')) {
        prompt.classList.remove('hidden')
        window.setTimeout(() => prompt.classList.add('hidden'), 5000)
      }
    } else if (status !== 'NORMAL' && worldLocked) {
      // LIMITED while rotating — debounce so we don't flicker the prompt
      const prompt = document.getElementById('ar-recenter-prompt')
      if (prompt && status === 'LIMITED' && reality?.trackingReason === 'EXCESSIVE_MOTION') {
        window.setTimeout(() => {
          if (!prompt.classList.contains('hidden')) return
          if (document.getElementById('ar-chrome')?.classList.contains('hidden')) return
          prompt.classList.remove('hidden')
        }, 900)
      }
    }

    // Re-entering an already-found spot: never re-reveal, just say so.
    const activeSpot = arTarget
    if (
      status === 'NORMAL' &&
      activeSpot &&
      spotStateLabel(activeSpot.id) === 'found' &&
      inRange() &&
      !alreadyFoundNotified
    ) {
      alreadyFoundNotified = true
      toast('You already found this location.')
    }
  },

  onCameraStatus(status: XrCameraStatusData): void {
    const raw = (isCameraStatusDetail(status) ? status.status : status) ?? 'unknown'
    setRcaCameraStatus(raw)
    const entry = isCameraStatusKey(raw) ? CAMERA_STATUS_UI[raw] : {label: raw, tone: '' as const}
    hudValue(hud.camera, entry.label, entry.tone)
    if (entry.tone === 'bad') toast('Camera access is needed to catch the reveal.')
    if (entry.tone === 'bad') setArExperienceState('tracking-lost', 'Camera access needed')
  },

  onReveal(spot: FilmSpot): void {
    hunt.reveal(spot.id)
    // Release the Jump-lock so the next hunt's heat can move again
    if (demoLockedSpotId === spot.id) demoLockedSpotId = null
    hudValue(hud.state, 'found', 'good')
    haptics.clap()
    setReticle('reveal')
    setArExperienceState('discovered', 'Scene discovered')
    // The chosen target just wrapped → fall back to auto-nearest.
    if (targetSpot?.id === spot.id) {
      targetSpot = null
      if (!hunt.allFound()) toast('Mystery solved — showing the next one.')
    }
    // Clap impact: shake the AR frame (reduced-motion users get none).
    arChrome.classList.remove('motion-safe:animate-shake')
    void arChrome.offsetWidth // restart the animation
    arChrome.classList.add('motion-safe:animate-shake')
    window.setTimeout(() => arChrome.classList.remove('motion-safe:animate-shake'), 420)
    renderProgress()
    toast(`Scene found — ${spot.name}.`)
    // Final set → "See your results", otherwise compact "Continue".
    const firstLabel = revealContinueBtn.querySelector('span')
    if (firstLabel) firstLabel.textContent = hunt.allFound() ? 'See your results' : 'Continue'
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
    exitAr()
  },
}

function openRevealPanel(spot: FilmSpot): void {
  window.clearTimeout(revealFallbackTimer)
  if (revealPanel.classList.contains('hidden')) {
    revealReturnFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null
    setRevealModalState(true)
  }
  revealSpotName.textContent = spot.name
  revealMovie.textContent = spot.movie.title
  revealBlurb.textContent = spot.movie.blurb
  revealSplit.textContent = formatClock(hunt.splitFor(spot.id))
  const revealCount = document.getElementById('reveal-count')
  if (revealCount) {
    const found = hunt.spots.filter((s) => s.status === 'found').length
    revealCount.textContent = `${String(found).padStart(2, '0')} / ${String(hunt.spots.length).padStart(2, '0')}`
  }
  revealAsset.style.backgroundColor = spot.asset.color
  revealAssetLabel.textContent = spot.asset.label
  revealKicker.textContent = hunt.allFound() ? 'Final scene found' : 'Scene found'

  // Movie clip when one is dropped at public/clips/<id>.mp4, swatch otherwise.
  // Client-side win: poster shows instantly (62kB jpg), 1.5MB mp4 only fetches on reveal
  // with preload=metadata + Save-Data guard — never preloads during Cold/Warm walk.
  const videoUrl = spot.asset.videoUrl
  if (videoUrl) {
    revealVideoFallbackUrl = spot.asset.videoFallbackUrl ?? null
    const conn = getNetworkConnection()
    const saveData = conn?.saveData || conn?.effectiveType === '2g' || conn?.effectiveType === 'slow-2g'
    if (saveData) {
      // Ultra-low bandwidth: stay on swatch, skip 1.5MB fetch entirely
      revealVideo.pause()
      revealVideo.classList.add('hidden')
      revealAssetRow.classList.remove('hidden')
    } else {
      revealVideo.classList.remove('hidden')
      revealAssetRow.classList.add('hidden')
      const abs = new URL(videoUrl, window.location.href).href
      if (revealVideo.src !== abs) {
        // poster per spot same-origin — 62kB, paints before 1.5MB video
        const poster = `/clips/${spot.id}-poster.jpg`
        revealVideo.poster = poster
        const isS3 = videoUrl.includes('s3.amazonaws.com') || videoUrl.includes('s3.ap-south-1')
        if (isS3) {
          revealVideo.crossOrigin = 'anonymous'
          revealVideo.setAttribute('crossorigin', 'anonymous')
        } else {
          revealVideo.removeAttribute('crossorigin')
          revealVideo.crossOrigin = ''
        }
        revealVideo.src = videoUrl
        revealVideo.load() // metadata only until play()
      }
      // play() triggers range request + decode only now
      revealVideo.play().catch(() => undefined)
    }
  } else {
    revealVideoFallbackUrl = null
    revealVideo.pause()
    revealVideo.classList.add('hidden')
    revealAssetRow.classList.remove('hidden')
  }

  revealPanel.classList.remove('hidden')
  window.requestAnimationFrame(() => revealContinueBtn.focus())
}

// ------------------------------------------------------------------ AR session
// The dashboard's camera CTA — re-enter the live AR hunt.
function openAr(): void {
  setHuntSheet(false)
  enterAr()
}

// ------------------------------------------------------------------ events
// Missing clip file → fall back to the swatch row instead of a broken player.
revealVideo.addEventListener('error', () => {
  if (revealVideoFallbackUrl && revealVideo.src !== new URL(revealVideoFallbackUrl, window.location.href).href) {
    const fallbackUrl = revealVideoFallbackUrl
    revealVideoFallbackUrl = null
    revealVideo.removeAttribute('crossorigin')
    revealVideo.crossOrigin = ''
    revealVideo.src = fallbackUrl
    revealVideo.load()
    revealVideo.play().catch(() => undefined)
    return
  }
  revealVideo.pause()
  revealVideo.classList.add('hidden')
  revealAssetRow.classList.remove('hidden')
})
// Scrim / handle: tapping outside the card dismisses to the hunt (world stays behind).
const dismissReveal = (): void => {
  haptics.tick()
  window.clearTimeout(revealFallbackTimer)
  revealPanel.classList.add('hidden')
  setRevealModalState(false)
  const restore = revealReturnFocus
  revealReturnFocus = null
  restore?.focus()
  if (hunt.allFound()) goToSummary()
  else setReticle(arTarget ? 'nearby' : 'tracking')
}
const revealScrim = document.getElementById('reveal-scrim')
revealScrim?.addEventListener('click', dismissReveal)

startButton.addEventListener('click', () => {
  haptics.tick()
  beginHunt()
})
demoStartBtn.addEventListener('click', () => {
  haptics.tick()
  hunt.reset()
  beginHunt()
  startDemoFlight()
  // Start on the first mystery immediately; the player opens the camera when
  // they are ready, keeping the demo flow consistent with a real hunt.
  manualJump(FILM_SPOTS[0])
})
demoHuntBtn.addEventListener('click', () => {
  startDemoFlight()
  manualJump(FILM_SPOTS[0])
})
openArBtn.addEventListener('click', () => {
  haptics.tick()
  openAr()
})
endArBtn.addEventListener('click', () => {
  haptics.tick()
  exitAr() // ✕ → dashboard; the hunt keeps running
})
// Hunt toggles the sheet over the live camera — slider + mystery list in one view.
const toggleSheet = (): void => {
  setHuntSheet(!huntSheetOpen)
  haptics.tick()
}
arSetlistBtn.addEventListener('click', toggleSheet)
huntSheetCloseBtn.addEventListener('click', () => {
  setHuntSheet(false)
  haptics.tick()
})
window.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && huntSheetOpen && !arChrome.classList.contains('hidden')) {
    event.preventDefault()
    setHuntSheet(false)
  }
})
// Sheet handle — keyboard accessible
const sheetHandle = document.querySelector<HTMLElement>('#screen-hunt > div:first-child')
if (sheetHandle) {
  let pointerStartY = 0
  let pointerLastY = 0
  let pointerLastAt = 0
  let pointerVelocity = 0
  sheetHandle.setAttribute('role', 'button')
  sheetHandle.setAttribute('tabindex', '0')
  sheetHandle.setAttribute('aria-label', 'Drag to close hunt menu')
  sheetHandle.style.touchAction = 'none'
  sheetHandle.addEventListener('pointerdown', (event) => {
    if (!huntSheetOpen) return
    stopSheetAnimation()
    sheetHandle.setPointerCapture(event.pointerId)
    pointerStartY = event.clientY
    pointerLastY = event.clientY
    pointerLastAt = performance.now()
    pointerVelocity = 0
    sheetWasDragged = false
    huntScreenEl.dataset.dragging = 'true'
  })
  sheetHandle.addEventListener('pointermove', (event) => {
    if (!huntSheetOpen || !sheetHandle.hasPointerCapture(event.pointerId)) return
    const now = performance.now()
    const delta = event.clientY - pointerStartY
    const elapsed = Math.max(1, now - pointerLastAt)
    pointerVelocity = ((event.clientY - pointerLastY) / elapsed) * 1000
    pointerLastY = event.clientY
    pointerLastAt = now
    if (Math.abs(delta) > 8) sheetWasDragged = true
    setSheetOffset(delta > 0 ? delta : delta * 0.14)
  })
  const finishSheetDrag = (event: PointerEvent): void => {
    if (!sheetHandle.hasPointerCapture(event.pointerId)) return
    sheetHandle.releasePointerCapture(event.pointerId)
    if (!sheetWasDragged) {
      huntScreenEl.dataset.dragging = 'false'
      return
    }
    const projected = sheetOffset + pointerVelocity * 0.18
    const shouldClose = projected > 96 || pointerVelocity > 620
    if (shouldClose) {
      const closeDistance = Math.max(240, huntScreenEl.offsetHeight)
      animateSheetTo(closeDistance, pointerVelocity, () => setHuntSheet(false))
    } else {
      animateSheetTo(0, pointerVelocity)
    }
  }
  sheetHandle.addEventListener('pointerup', finishSheetDrag)
  sheetHandle.addEventListener('pointercancel', () => {
    if (huntSheetOpen) animateSheetTo(0)
  })
  sheetHandle.addEventListener('click', () => {
    if (sheetWasDragged) {
      sheetWasDragged = false
      return
    }
    toggleSheet()
  })
  sheetHandle.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      toggleSheet()
    }
  })
}
recenterBtn.addEventListener('click', () => ar?.recenter())
arBottomBar.addEventListener('pointerdown', wakeArControls)
arBottomBar.addEventListener('focusin', wakeArControls)
// Inline prompt near reticle — the "why is this crooked" fix you asked for
const recenterPrompt = $<HTMLButtonElement>('#ar-recenter-prompt')
recenterPrompt.addEventListener('click', () => {
  haptics.tick()
  recenterPrompt.classList.add('hidden')
  ar?.recenter()
})
// Auto-recenter after physical rotation; the module keeps this browser wiring
// out of the hunt orchestrator and leaves pose ownership with the AR controller.
bindOrientationRecenter(
  () => !arChrome.classList.contains('hidden'),
  () => ar?.recenter(),
  recenterPrompt,
)
// Request DeviceMotion permission on first hunt start (iOS gated - needed for still-window guard)
type DeviceMotionWithPermission = typeof DeviceMotionEvent & {requestPermission(): Promise<string>}
const canRequestMotion = (value: typeof DeviceMotionEvent): value is DeviceMotionWithPermission =>
  'requestPermission' in value && typeof value.requestPermission === 'function'

const requestMotion = (): void => {
  const motion = DeviceMotionEvent
  if (canRequestMotion(motion)) {
    motion.requestPermission().catch(() => undefined)
  }
}
startButton.addEventListener('click', requestMotion, {once: true})
demoStartBtn.addEventListener('click', requestMotion, {once: true})

revealContinueBtn.addEventListener('click', () => {
  haptics.tick()
  window.clearTimeout(revealFallbackTimer)
  revealPanel.classList.add('hidden')
  setRevealModalState(false)
  const restore = revealReturnFocus
  revealReturnFocus = null
  restore?.focus()
  if (hunt.allFound()) {
    goToSummary()
  } else {
    // AR spectacle first, information second — then straight back to hunting.
    setReticle(arTarget ? 'nearby' : 'tracking')
  }
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
  demoLockedSpotId = null
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
  window.localStorage.removeItem('campus-film-hunt:v2')
  window.location.reload()
})

// ------------------------------------------------------------------ debug HUD
hudValue(hud.device, /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent) ? 'mobile' : 'desktop')
hudValue(hud.engine, 'waiting for camera', 'warn')

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
  if (debugEnabled && hunt.status === 'in_progress' && rcaHuntStartMs === null) {
    rcaHuntStartMs = performance.now()
  }
  switch (hunt.status) {
    case 'in_progress':
      // Resume onto the planning screen — one tap on "Return to camera"
      // re-enters the live AR hunt (and re-asks camera permission politely).
      startTimerTicker()
      startLocation()
      showOnlyScreen('hunt')
      screen.renderSpotList(hunt.spots)
      refreshTargetPicker()
      renderProgress()
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
  renderProgress()
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
      reveal: () => ar?.forceReveal(),
      openAr: () => openAr(),
    },
  })
}
