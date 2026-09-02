/**
 * Global game state. One module-scoped instance. Server-authoritative — the
 * client mirrors what the Worker returns and never advances a level itself.
 */

import type {ClueView, GeoSample, HintRung, RevealView, Session, SplitView} from '@cmh/shared'
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

  /** @returns true once a session snapshot was loaded. */
  async refresh(): Promise<boolean> {
    if (!this.token) return false
    try {
      const state = await api.getState(this.token)
      this.session = state.session
      this.clue = state.clue
      this.splits = state.splits
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
    this.loaded = false
    save(LS_TOKEN, null)
    save(LS_BATCH, null)
    save(LS_DEMO, null)
    save(LS_DEMO_STOPS, null)
  }
}

export const game = new Game()
