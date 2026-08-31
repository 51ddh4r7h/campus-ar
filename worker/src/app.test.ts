/**
 * HTTP integration — the Hono app over an in-memory store. Exercises routing,
 * the Valibot guards, auth, and the engine wiring together (the pure engine
 * has its own tests in @cmh/shared).
 */

import {beforeEach, describe, expect, it} from 'vitest'
import {InMemoryStore, VALIDATION, locationById, type GeoSample} from '@cmh/shared'
import {createApp} from './app'
import type {Env} from './env'

class Clock {
  t = Date.parse('2026-09-01T09:00:00Z')
  private n = 0
  now() {
    return this.t
  }
  randomId() {
    return `id-${++this.n}`
  }
  randomToken() {
    return `tok-${++this.n}`
  }
  advance(ms: number) {
    this.t += ms
  }
}

let app: ReturnType<typeof createApp>
let store: InMemoryStore
let clock: Clock

beforeEach(() => {
  store = new InMemoryStore()
  clock = new Clock()
  app = createApp(() => store, clock)
})

const json = (path: string, body?: unknown, headers: Record<string, string> = {}) => {
  const init: RequestInit =
    body === undefined
      ? {method: 'GET', headers}
      : {method: 'POST', headers: {'content-type': 'application/json', ...headers}, body: JSON.stringify(body)}
  return app.request(path, init, {} as Env)
}

async function bootPlayer(route?: string[]) {
  const batch = (await (await json('/admin/batches', {name: 'T'})).json()) as {id: string}
  const reg = (await (
    await json(`/admin/batches/${batch.id}/players`, {
      players: [route ? {name: 'A', rosterId: 'r1', route} : {name: 'A', rosterId: 'r1'}],
    })
  ).json()) as {players: Array<{sessionToken: string; stops: string[]}>}
  return {batchId: batch.id, ...reg.players[0]!}
}

const parkedAt = (id: string, endTsMs: number): GeoSample[] => {
  const loc = locationById(id)!
  const out: GeoSample[] = []
  for (let t = endTsMs; t >= endTsMs - (VALIDATION.dwellMs + 6_000); t -= 3_000) {
    out.push({lat: loc.lat, lng: loc.lng, accuracyM: 0, tsMs: t, simulated: true})
  }
  return out
}

describe('app', () => {
  it('serves health', async () => {
    const res = await json('/health')
    expect(res.status).toBe(200)
    expect(((await res.json()) as {ok: boolean}).ok).toBe(true)
  })

  it('rejects a bad body with 400', async () => {
    const res = await json('/admin/batches', {})
    expect(res.status).toBe(400)
  })

  it('rejects a missing bearer token with 401', async () => {
    expect((await json('/session/start', {})).status).toBe(401)
    expect((await app.request('/session')).status).toBe(401)
  })

  it('registers a pinned demo route and starts', async () => {
    const stops = ['mind-studio', 'aqua-point', 'the-fountain', 'central-library', 'auditorium']
    const p = await bootPlayer(stops)
    expect(p.stops).toEqual(stops)

    const start = await json('/session/start', {}, {authorization: `Bearer ${p.sessionToken}`})
    expect(start.status).toBe(200)
    const body = (await start.json()) as {clue: {level: number; clueText: {far: string}}}
    expect(body.clue.level).toBe(1)
    expect(body.clue.clueText.far.length).toBeGreaterThan(0)
  })

  it('nearby reports warmth without leaking a coordinate', async () => {
    const p = await bootPlayer(['mind-studio', 'aqua-point', 'the-fountain', 'central-library', 'auditorium'])
    await json('/session/start', {}, {authorization: `Bearer ${p.sessionToken}`})

    const res = await json(
      '/session/nearby',
      {samples: parkedAt('mind-studio', clock.now())},
      {authorization: `Bearer ${p.sessionToken}`},
    )
    const body = (await res.json()) as {atTarget: boolean; heat: number; band: number}
    expect(body.atTarget).toBe(true)
    expect(body.heat).toBe(100)
    expect(JSON.stringify(body)).not.toMatch(/lat":|lng":/)
  })

  it('validates an arrival and serves the reveal', async () => {
    const p = await bootPlayer(['mind-studio', 'aqua-point', 'the-fountain', 'central-library', 'auditorium'])
    const auth = {authorization: `Bearer ${p.sessionToken}`}
    await json('/session/start', {}, auth)

    clock.advance(VALIDATION.minLegMs + 60_000)
    const res = await json('/session/arrive', {samples: parkedAt('mind-studio', clock.now())}, auth)
    const body = (await res.json()) as {ok: boolean; reveal: {locationName: string} | null; nextClue: {level: number}}
    expect(body.ok).toBe(true)
    expect(body.reveal?.locationName).toBe('Mind Studio')
    expect(body.nextClue.level).toBe(2)
  })

  it('rejects an arrival at the wrong place', async () => {
    const p = await bootPlayer(['mind-studio', 'aqua-point', 'the-fountain', 'central-library', 'auditorium'])
    const auth = {authorization: `Bearer ${p.sessionToken}`}
    await json('/session/start', {}, auth)
    clock.advance(VALIDATION.minLegMs + 60_000)
    // Standing at a later stop → level_locked, level does not advance.
    const res = await json('/session/arrive', {samples: parkedAt('the-fountain', clock.now())}, auth)
    const body = (await res.json()) as {ok: boolean; failure: string}
    expect(body.ok).toBe(false)
    expect(body.failure).toBe('level_locked')
  })

  it('standings come back for a batch', async () => {
    const p = await bootPlayer()
    await json('/session/start', {}, {authorization: `Bearer ${p.sessionToken}`})
    const res = await json(`/standings/${p.batchId}`)
    expect(res.status).toBe(200)
    const {rows} = (await res.json()) as {rows: unknown[]}
    expect(Array.isArray(rows)).toBe(true)
  })
})
