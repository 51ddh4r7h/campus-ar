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

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response
  try {
    res = await fetch(`${BASE}${path}`, init)
  } catch (cause) {
    throw new ApiError(0, 'offline', cause instanceof Error ? cause.message : 'network error')
  }
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

const auth = (token: string): HeadersInit => ({Authorization: `Bearer ${token}`})
const jsonAuth = (token: string): HeadersInit => ({...auth(token), 'content-type': 'application/json'})

export interface StateResponse {
  session: Session
  clue: ClueView | null
  splits: import('@cmh/shared').Split[]
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

  standings: (batchId: string, token?: string) =>
    request<{rows: StandingRow[]}>(`/standings/${batchId}`, {
      headers: token ? auth(token) : undefined,
    }),

  // Dev/registration helpers — real events pre-register players out of band.
  createBatch: (name: string) =>
    request<{id: string; name: string; poolSize: number}>('/admin/batches', {
      method: 'POST',
      headers: {'content-type': 'application/json'},
      body: JSON.stringify({name}),
    }),

  registerPlayers: (
    batchId: string,
    players: Array<{name: string; rosterId: string; route?: string[]}>,
  ) =>
    request<{
      players: Array<{playerId: string; name: string; rosterId: string; sessionToken: string; stops: string[]}>
    }>(`/admin/batches/${batchId}/players`, {
      method: 'POST',
      headers: {'content-type': 'application/json'},
      body: JSON.stringify({players}),
    }),
}
