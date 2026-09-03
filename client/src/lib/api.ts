/**
 * Typed client for the game Worker. Responses are shaped by @cmh/shared types;
 * this is our own API so we trust the shape rather than shipping a validator.
 */

import type {
  ClueView,
  GeoSample,
  HintRung,
  NearbyResult,
  Session,
  StandingRow,
  StartHuntResponse,
  ValidationResult,
} from '@cmh/shared'
import {net} from './stores/net.svelte'

const BASE = import.meta.env.VITE_API_BASE ?? '/api'

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message)
    this.name = 'ApiError'
  }
}

/**
 * Fetch, mapping the two failures that mean "the network or the server is
 * down" onto ApiError and flipping the shared online flag. Everything it
 * returns is a response the caller can actually read.
 */
async function send(path: string, init?: RequestInit): Promise<Response> {
  let res: Response
  try {
    res = await fetch(`${BASE}${path}`, init)
  } catch (cause) {
    net.mark(false)
    throw new ApiError(0, 'offline', cause instanceof Error ? cause.message : 'network error')
  }
  if (res.status >= 500) {
    net.mark(false)
    throw new ApiError(res.status, 'server', 'server error')
  }
  net.mark(true)
  return res
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await send(path, init)
  if (res.status === 204) {
    // SAFETY: a 204 has no body; void-returning callers type T as void.
    return undefined as T
  }
  const body: unknown = await res.json().catch(() => ({}))
  if (!res.ok) {
    // SAFETY: the Worker's error handler always returns { error, message }.
    const err = (body ?? {}) as {error?: string; message?: string}
    throw new ApiError(res.status, err.error ?? 'error', err.message ?? res.statusText)
  }
  // SAFETY: our own Worker; every 2xx body matches the declared T.
  return body as T
}

export interface BatchRow {
  id: string
  name: string
  status: string
  isDemo: boolean
  createdAtMs: number
  playerCount: number
  eventCode: string | null
}

export interface RosterEntry {
  playerId: string
  name: string
  rosterId: string
  sessionToken: string
  stops: string[]
}

const auth = (token: string): HeadersInit => ({Authorization: `Bearer ${token}`})
const adminHeaders = (key?: string): HeadersInit => (key ? {'X-Admin-Key': key} : {})
const adminJson = (key?: string): HeadersInit => ({
  'content-type': 'application/json',
  ...adminHeaders(key),
})
const jsonAuth = (token: string): HeadersInit => ({...auth(token), 'content-type': 'application/json'})

export interface StateResponse {
  session: Session
  clue: ClueView | null
  splits: import('@cmh/shared').SplitView[]
}

export const api = {
  health: () => request<{ok: boolean}>('/health'),

  startHunt: (token: string) =>
    request<StartHuntResponse>('/session/start', {method: 'POST', headers: auth(token)}),

  getState: (token: string) => request<StateResponse>('/session', {headers: auth(token)}),

  nearby: (token: string, samples: GeoSample[]) =>
    request<NearbyResult>('/session/nearby', {
      method: 'POST',
      headers: jsonAuth(token),
      body: JSON.stringify({samples}),
    }),

  arrive: (token: string, samples: GeoSample[]) =>
    request<ValidationResult>('/session/arrive', {
      method: 'POST',
      headers: jsonAuth(token),
      body: JSON.stringify({samples}),
    }),

  useHint: (token: string, rung: HintRung) =>
    request<{clue: ClueView; penaltyMs: number; session: Session}>('/session/hint', {
      method: 'POST',
      headers: jsonAuth(token),
      body: JSON.stringify({rung}),
    }),

  breadcrumbs: (
    token: string,
    crumbs: Array<{lat: number; lng: number; accuracyM: number; tsMs: number}>,
  ) =>
    request<void>('/session/breadcrumbs', {
      method: 'POST',
      headers: jsonAuth(token),
      body: JSON.stringify({crumbs}),
    }),

  /** Record a viewing of the scene. Beyond the free allowance it costs time. */
  viewScene: (token: string) =>
    request<{penaltyMs: number; session: Session}>('/session/view', {
      method: 'POST',
      headers: auth(token),
    }),

  standings: (batchId: string, token?: string) =>
    request<{rows: StandingRow[]}>(`/standings/${batchId}`, {
      headers: token ? auth(token) : undefined,
    }),

  /** What a signup link points at — so the player can see they have the right one. */
  event: (code: string) =>
    request<{name: string; status: string; isDemo: boolean}>(`/event/${encodeURIComponent(code)}`),

  /** Self-serve signup against a cohort's event code. No admin key. */
  signup: (body: {eventCode: string; username: string; name: string; password: string}) =>
    request<{batchId: string; sessionToken: string; name: string; stops: string[]}>(
      '/session/signup',
      {method: 'POST', headers: {'content-type': 'application/json'}, body: JSON.stringify(body)},
    ),

  /** Return visit — roll number + password back for the session token. */
  login: (body: {eventCode: string; username: string; password: string}) =>
    request<{batchId: string; sessionToken: string; name: string}>('/session/login', {
      method: 'POST',
      headers: {'content-type': 'application/json'},
      body: JSON.stringify(body),
    }),

  /** Practice run. Needs no admin key — the server marks the batch as demo. */
  demoSession: (route?: string[]) =>
    request<{batchId: string; sessionToken: string; name: string; stops: string[]}>(
      '/demo/session',
      {
        method: 'POST',
        headers: {'content-type': 'application/json'},
        body: JSON.stringify(route ? {route} : {}),
      },
    ),

  // Organiser console — every one of these needs the admin key.
  createBatch: (name: string, demo = false, adminKey?: string, eventCode?: string) => {
    const body = eventCode ? {name, demo, eventCode} : {name, demo}
    return request<{
      id: string
      name: string
      isDemo: boolean
      poolSize: number
      eventCode: string | null
    }>('/admin/batches', {
      method: 'POST',
      headers: adminJson(adminKey),
      body: JSON.stringify(body),
    })
  },

  registerPlayers: (
    batchId: string,
    players: Array<{name: string; rosterId: string; route?: string[]}>,
    adminKey?: string,
  ) =>
    request<{players: RosterEntry[]}>(`/admin/batches/${batchId}/players`, {
      method: 'POST',
      headers: adminJson(adminKey),
      body: JSON.stringify({players}),
    }),

  listBatches: (adminKey: string) =>
    request<{batches: BatchRow[]}>('/admin/batches', {headers: adminHeaders(adminKey)}),

  roster: (batchId: string, adminKey: string) =>
    request<{players: RosterEntry[]}>(`/admin/batches/${batchId}/players`, {
      headers: adminHeaders(adminKey),
    }),
}
