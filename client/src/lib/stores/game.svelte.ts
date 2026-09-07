/**
 * Global game state. One module-scoped instance. Server-authoritative — the
 * client mirrors what the Worker returns and never advances a level itself.
 */

import type {
  ClueView,
  GeoSample,
  HintRung,
  ReplayView,
  RevealView,
  Session,
  SplitView,
} from '@cmh/shared'
import {DEFAULT_PAR_CONSTANTS} from '@cmh/shared'

const FREE_VIEWS = DEFAULT_PAR_CONSTANTS.freeViews
import {api, ApiError} from '../api'
import {net} from './net.svelte'

const LS_TOKEN = 'cmh.token'
const LS_BATCH = 'cmh.batch'
const LS_DEMO = 'cmh.demo'
const LS_DEMO_STOPS = 'cmh.demoStops'

const load = (k: string): string | null => {
  try {
    return localStorage.getItem(k)
  } catch {
    return null
  }
}
const save = (k: string, v: string | null): void => {
  try {
    if (v === null) localStorage.removeItem(k)
    else localStorage.setItem(k, v)
  } catch {
    /* private mode */
  }
}

/** Demo route stops persisted as a JSON string array; anything else → []. */
const readStops = (): string[] => {
  try {
    const raw: unknown = JSON.parse(load(LS_DEMO_STOPS) ?? '[]')
    return Array.isArray(raw) ? raw.filter((x): x is string => typeof x === 'string') : []
  } catch {
    return []
  }
}

class Game {
  token = $state<string | null>(load(LS_TOKEN))
  batchId = $state<string | null>(load(LS_BATCH))
  demo = $state<boolean>(load(LS_DEMO) === '1')
  /** Route location ids — ONLY populated in demo mode, for the GPS simulator. */
  demoStops = $state<string[]>(readStops())

  session = $state<Session | null>(null)
  clue = $state<ClueView | null>(null)
  splits = $state<SplitView[]>([])
  lastReveal = $state<RevealView | null>(null)
  playerName = $state<string>('')

  /** True once we have a valid token + a session snapshot. */
  loaded = $state(false)

  get online(): boolean {
    return net.online
  }

  get inProgress(): boolean {
    return this.session?.status === 'in_progress'
  }
  get complete(): boolean {
    return this.session?.status === 'complete'
  }
  get level(): number {
    return this.session?.currentLevel ?? 1
  }

  setCredentials(
    token: string,
    batchId: string,
    name: string,
    opts: {demo: boolean; demoStops?: string[]},
  ): void {
    this.token = token
    this.batchId = batchId
    this.playerName = name
    this.demo = opts.demo
    this.demoStops = opts.demoStops ?? []
    save(LS_TOKEN, token)
    save(LS_BATCH, batchId)
    save(LS_DEMO, opts.demo ? '1' : null)
    save(LS_DEMO_STOPS, opts.demoStops ? JSON.stringify(opts.demoStops) : null)
  }

  /** Create an account against a cohort's event code, then hold the session. */
  async signUp(input: {eventCode: string; username: string; name: string; password: string}): Promise<void> {
    const s = await api.signup(input)
    this.setCredentials(s.sessionToken, s.batchId, s.name, {demo: false})
  }

  /** Return visit — roll number + password back for the session. */
  async logIn(input: {eventCode: string; username: string; password: string}): Promise<void> {
    const s = await api.login(input)
    this.setCredentials(s.sessionToken, s.batchId, s.name, {demo: false})
  }

  get paused(): boolean {
    return this.session?.status === 'paused'
  }
  get abandoned(): boolean {
    return this.session?.status === 'abandoned'
  }
  /** Finished either way — the wrap screen treats both the same. */
  get finished(): boolean {
    return this.complete || this.abandoned
  }

  async pause(): Promise<void> {
    if (!this.token) return
    this.session = (await api.pause(this.token)).session
  }
  async resume(): Promise<void> {
    if (!this.token) return
    this.session = (await api.resume(this.token)).session
  }
  async abandon(): Promise<void> {
    if (!this.token) return
    this.session = (await api.abandon(this.token)).session
  }
  /**
   * Where this player's request to play again has got to.
   *
   * Held here rather than on the finish screen because the answer arrives from
   * an organiser's console, not from anything the player did — the screen has
   * to keep asking, and it has to survive a reload while it waits.
   */
  replay = $state<ReplayView | null>(null)

  /** Ask an organiser for another run. */
  async requestReplay(): Promise<void> {
    if (!this.token) throw new Error('no token')
    await api.requestReplay(this.token)
    await this.refreshReplay()
  }

  async refreshReplay(): Promise<void> {
    if (!this.token) return
    try {
      this.replay = await api.replayState(this.token)
    } catch {
      /* keep last-known; the poll comes round again */
    }
  }

  /** @returns true once a session snapshot was loaded. */
  async refresh(): Promise<boolean> {
    if (!this.token) return false
    try {
      const state = await api.getState(this.token)
      this.session = state.session
      this.clue = state.clue
      this.splits = state.splits
      // The server is the authority on this. A practice run replaces the signed
      // -in token with its own, and the flag it left behind in localStorage
      // then kept later sessions simulated; asking every refresh means a stale
      // flag cannot survive one.
      // An approved replay reseats the player server-side, so a hunt that is
      // suddenly unstarted again means the old run's clue and splits are gone.
      if (state.session.status === 'not_started') {
        this.clue = state.clue
        this.splits = []
        this.lastReveal = null
      }
      this.demo = state.isDemo
      save(LS_DEMO, state.isDemo ? '1' : null)
      this.loaded = true
      return true
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        this.reset()
        return false
      }
      // offline / server — net store already flagged it; caller retries.
      if (err instanceof ApiError) return false
      throw err
    }
  }

  async start(): Promise<void> {
    if (!this.token) throw new Error('no token')
    const res = await api.startHunt(this.token)
    this.session = res.session
    this.clue = res.clue
  }

  async arrive(samples: GeoSample[]): Promise<import('@cmh/shared').ValidationResult> {
    if (!this.token) throw new Error('no token')
    const res = await api.arrive(this.token, samples)
    this.session = res.session
    if (res.split) this.splits = [...this.splits.filter((s) => s.level !== res.split!.level), res.split]
    if (res.reveal) this.lastReveal = res.reveal
    if (res.nextClue) this.clue = res.nextClue
    return res
  }

  /**
   * Tell the server the scene was watched. Deliberately fire-and-forget: the
   * clip must start the instant it is asked for, and a player on a bad signal
   * should never be charged for a viewing the server never heard about.
   */
  async view(): Promise<number> {
    if (!this.token) return 0
    try {
      const res = await api.viewScene(this.token)
      this.session = res.session
      return res.penaltyMs
    } catch {
      return 0
    }
  }

  /** Free viewings left on this level, for warning before one costs. */
  get freeViewsLeft(): number {
    return Math.max(0, FREE_VIEWS - (this.session?.currentLevelViews ?? 0))
  }

  async hint(rung: HintRung): Promise<number> {
    if (!this.token) throw new Error('no token')
    const res = await api.useHint(this.token, rung)
    this.session = res.session
    this.clue = res.clue
    return res.penaltyMs
  }

  reset(): void {
    this.token = null
    this.batchId = null
    this.demo = false
    this.session = null
    this.clue = null
    this.splits = []
    this.playerName = ''
    this.demoStops = []
    this.replay = null
    this.loaded = false
    save(LS_TOKEN, null)
    save(LS_BATCH, null)
    save(LS_DEMO, null)
    save(LS_DEMO_STOPS, null)
  }
}

export const game = new Game()
