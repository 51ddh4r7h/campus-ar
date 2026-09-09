/**
 * HTTP integration — the Hono app over an in-memory store. Exercises routing,
 * the Valibot guards, auth, and the engine wiring together (the pure engine
 * has its own tests in @cmh/shared).
 */

import {beforeEach, describe, expect, it} from 'vitest'
import {InMemoryStore, LAYOUT, VALIDATION, locationById, type GeoSample} from '@cmh/shared'
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
  async hashPassword(pw: string) {
    return `h:${pw}`
  }
  async verifyPassword(pw: string, stored: string) {
    return stored === `h:${pw}`
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

const ADMIN = 'test-admin-key'
const env = {ADMIN_KEY: ADMIN} as Env

/** Admin routes fail closed, so every request here carries the key. */
const json = (path: string, body?: unknown, headers: Record<string, string> = {}) => {
  const all = {'X-Admin-Key': ADMIN, ...headers}
  const init: RequestInit =
    body === undefined
      ? {method: 'GET', headers: all}
      : {method: 'POST', headers: {'content-type': 'application/json', ...all}, body: JSON.stringify(body)}
  return app.request(path, init, env)
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

describe('app — deleting batches', () => {
  it('removes a batch and everything recorded against it', async () => {
    const p = await bootPlayer(['amphitheatre', 'symbieat', 'sibm', 'library', 'fountain'])
    await json('/session/start', {}, {Authorization: `Bearer ${p.sessionToken}`})
    clock.advance(4 * 60_000)
    await json('/session/arrive', {samples: parkedAt('amphitheatre', clock.now())}, {
      Authorization: `Bearer ${p.sessionToken}`,
    })

    // Fails closed without the key, like every other admin route.
    const noKey = await app.request(`/admin/batches/${p.batchId}`, {method: 'DELETE'}, env)
    expect(noKey.status).toBe(403)

    const res = await app.request(
      `/admin/batches/${p.batchId}`,
      {method: 'DELETE', headers: {'X-Admin-Key': ADMIN}},
      env,
    )
    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({players: 1})

    // The batch is gone, and so is the player's way back in.
    expect((await json('/admin/batches')).status).toBe(200)
    const {batches} = (await (await json('/admin/batches')).json()) as {batches: Array<{id: string}>}
    expect(batches.find((b) => b.id === p.batchId)).toBeUndefined()
    expect(
      (await json('/session', undefined, {Authorization: `Bearer ${p.sessionToken}`})).status,
    ).toBe(401)
    // And nothing of theirs survives to be reported on.
    expect(await store.listBatchSplits(p.batchId)).toHaveLength(0)
    expect(await store.listEvents(p.batchId, 100)).toHaveLength(0)
    expect(await store.listPlayers(p.batchId)).toHaveLength(0)
  })

  it('sweeps practice batches and leaves real ones alone', async () => {
    const real = await bootPlayer()
    await json('/demo/session', {})
    await json('/demo/session', {})

    const before = (await (await json('/admin/batches')).json()) as {batches: Array<{isDemo: boolean}>}
    expect(before.batches.filter((b) => b.isDemo)).toHaveLength(2)

    const res = await app.request(
      '/admin/batches/demo',
      {method: 'DELETE', headers: {'X-Admin-Key': ADMIN}},
      env,
    )
    expect(await res.json()).toEqual({deleted: 2})

    const after = (await (await json('/admin/batches')).json()) as {
      batches: Array<{id: string; isDemo: boolean}>
    }
    expect(after.batches.filter((b) => b.isDemo)).toHaveLength(0)
    expect(after.batches.find((b) => b.id === real.batchId)).toBeDefined()
  })
})

describe('app — analytics', () => {
  it('fails closed without the admin key, and reports a played batch with it', async () => {
    const p = await bootPlayer(['amphitheatre', 'symbieat', 'sibm', 'library', 'fountain'])
    await json('/session/start', {}, {Authorization: `Bearer ${p.sessionToken}`})
    clock.advance(4 * 60_000)
    await json('/session/arrive', {samples: parkedAt('amphitheatre', clock.now())}, {
      Authorization: `Bearer ${p.sessionToken}`,
    })

    const open = await app.request(`/admin/batches/${p.batchId}/analytics`, {method: 'GET'}, env)
    expect(open.status).toBe(403)

    const res = await json(`/admin/batches/${p.batchId}/analytics`)
    expect(res.status).toBe(200)
    const a = (await res.json()) as {
      registered: number
      started: number
      activation: {count: number; of: number}
      funnel: Array<{label: string; count: number}>
      locations: Array<{locationId: string; found: number}>
    }
    expect(a.registered).toBe(1)
    expect(a.started).toBe(1)
    expect(a.activation).toEqual({count: 1, of: 1})
    expect(a.funnel.find((f) => f.label === 'Found 1')!.count).toBe(1)
    expect(a.locations.find((l) => l.locationId === 'amphitheatre')!.found).toBe(1)
  })

  it('404s for a batch that does not exist, rather than reporting zeroes', async () => {
    expect((await json('/admin/batches/gone/analytics')).status).toBe(404)
  })
})

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
    const stops = ['amphitheatre', 'symbieat', 'sibm', 'library', 'fountain']
    const p = await bootPlayer(stops)
    expect(p.stops).toEqual(stops)

    const start = await json('/session/start', {}, {authorization: `Bearer ${p.sessionToken}`})
    expect(start.status).toBe(200)
    const body = (await start.json()) as {clue: {level: number; clueText: {far: string}}}
    expect(body.clue.level).toBe(1)
    expect(body.clue.clueText.far.length).toBeGreaterThan(0)
  })

  it('nearby reports warmth without leaking a coordinate', async () => {
    const p = await bootPlayer(['amphitheatre', 'symbieat', 'sibm', 'library', 'fountain'])
    await json('/session/start', {}, {authorization: `Bearer ${p.sessionToken}`})

    const res = await json(
      '/session/nearby',
      {samples: parkedAt('amphitheatre', clock.now())},
      {authorization: `Bearer ${p.sessionToken}`},
    )
    const body = (await res.json()) as {atTarget: boolean; heat: number; band: number}
    expect(body.atTarget).toBe(true)
    expect(body.heat).toBe(100)
    expect(JSON.stringify(body)).not.toMatch(/lat":|lng":/)
  })

  it('validates an arrival and serves the reveal', async () => {
    const p = await bootPlayer(['amphitheatre', 'symbieat', 'sibm', 'library', 'fountain'])
    const auth = {authorization: `Bearer ${p.sessionToken}`}
    await json('/session/start', {}, auth)

    clock.advance(LAYOUT.minLegMs + 60_000)
    const res = await json('/session/arrive', {samples: parkedAt('amphitheatre', clock.now())}, auth)
    const body = (await res.json()) as {ok: boolean; reveal: {locationName: string} | null; nextClue: {level: number}}
    expect(body.ok).toBe(true)
    expect(body.reveal?.locationName).toBe('Amphitheatre')
    expect(body.nextClue.level).toBe(2)
  })

  it('rejects an arrival at the wrong place', async () => {
    const p = await bootPlayer(['amphitheatre', 'symbieat', 'sibm', 'library', 'fountain'])
    const auth = {authorization: `Bearer ${p.sessionToken}`}
    await json('/session/start', {}, auth)
    clock.advance(LAYOUT.minLegMs + 60_000)
    // Standing at a later stop → level_locked, level does not advance.
    const res = await json('/session/arrive', {samples: parkedAt('fountain', clock.now())}, auth)
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

  it('takes a survey response and shows it in analytics', async () => {
    const p = await bootPlayer()
    const auth = {authorization: `Bearer ${p.sessionToken}`}

    const good = {stars: 5, clues: 'right', navigation: 'confident', friction: 'none', recommend: 'yes'}
    expect((await json('/session/feedback', good, auth)).status).toBe(204)

    // An answer outside a question's option set is a 400.
    expect((await json('/session/feedback', {...good, clues: 'nonsense'}, auth)).status).toBe(400)
    // Stars out of range is a 400.
    expect((await json('/session/feedback', {...good, stars: 9}, auth)).status).toBe(400)

    const report = (await (await json(`/admin/batches/${p.batchId}/analytics`)).json()) as {
      feedback: {responses: number; avgStars: number | null}
    }
    expect(report.feedback.responses).toBe(1)
    expect(report.feedback.avgStars).toBe(5)
  })
})

describe('admin console reads', () => {
  it('lists batches newest first, with roster counts', async () => {
    await json('/admin/batches', {name: 'First'})
    const b = await bootPlayer()
    const res = await json('/admin/batches')
    expect(res.status).toBe(200)
    const {batches} = (await res.json()) as {
      batches: Array<{id: string; name: string; playerCount: number; isDemo: boolean}>
    }
    expect(batches).toHaveLength(2)
    expect(batches.find((x) => x.id === b.batchId)?.playerCount).toBe(1)
    expect(batches.every((x) => x.isDemo === false)).toBe(true)
  })

  it('returns the roster with personal tokens and assigned stops', async () => {
    const b = await bootPlayer()
    const res = await json(`/admin/batches/${b.batchId}/players`)
    const {players} = (await res.json()) as {
      players: Array<{
        name: string
        sessionToken: string
        stops: string[]
        status: string
        currentLevel: number
        scoreMs: number | null
      }>
    }
    expect(players).toHaveLength(1)
    expect(players[0]!.name).toBe('A')
    expect(players[0]!.sessionToken).toBe(b.sessionToken)
    expect(players[0]!.stops).toHaveLength(5)
    expect(players[0]).toMatchObject({status: 'not_started', currentLevel: 1, scoreMs: null})
  })

  it('refuses the reads without a matching admin key', async () => {
    const bad = await app.request('/admin/batches', {method: 'GET'}, env)
    expect(bad.status).toBe(403)

    const good = await app.request(
      '/admin/batches',
      {method: 'GET', headers: {'X-Admin-Key': ADMIN}},
      env,
    )
    expect(good.status).toBe(200)
  })

  it('fails closed when no admin key is configured at all', async () => {
    const res = await app.request(
      '/admin/batches',
      {method: 'GET', headers: {'X-Admin-Key': 'anything'}},
      {} as Env,
    )
    expect(res.status).toBe(503)
  })

  it('starts a practice session without an admin key', async () => {
    const res = await app.request(
      '/demo/session',
      {
        method: 'POST',
        headers: {'content-type': 'application/json'},
        body: JSON.stringify({}),
      },
      {} as Env,
    )
    expect(res.status).toBe(200)
    const s = (await res.json()) as {sessionToken: string; batchId: string; stops: string[]}
    expect(s.sessionToken).toBeTruthy()
    expect(s.stops).toHaveLength(5)
  })
})

describe('hints', () => {
  it('are available the moment the level starts, in rung order', async () => {
    const p = await bootPlayer()
    await json('/session/start', {}, {Authorization: `Bearer ${p.sessionToken}`})
    const hint = (rung: string) =>
      json('/session/hint', {rung}, {Authorization: `Bearer ${p.sessionToken}`})

    // No wait — the first hint is takeable immediately.
    expect((await hint('warm')).status).toBe(200)
    // But rung 2 needs rung 1 first, and there is no time that unlocks a skip.
    // (rung 2 is available now because rung 1 was just taken.)
    expect((await hint('close')).status).toBe(200)
    // rung 1 again is out of order — refused, not a 200.
    expect((await hint('warm')).status).toBe(409)
  })
})

describe('scene viewings', () => {
  const view = (token: string) =>
    app.request('/session/view', {method: 'POST', headers: {Authorization: `Bearer ${token}`}}, env)

  it('is free for the first look and charges every one after', async () => {
    const p = await bootPlayer()
    await json('/session/start', {}, {Authorization: `Bearer ${p.sessionToken}`})

    const first = (await (await view(p.sessionToken)).json()) as {penaltyMs: number}
    const second = (await (await view(p.sessionToken)).json()) as {
      penaltyMs: number
      session: {penaltyMs: number; currentLevelViews: number}
    }
    const third = (await (await view(p.sessionToken)).json()) as {
      penaltyMs: number
      session: {penaltyMs: number}
    }

    expect(first.penaltyMs).toBe(0)
    expect(second.penaltyMs).toBeGreaterThan(0)
    expect(third.penaltyMs).toBeGreaterThan(0)
    // Each charge stacks on the score, not just the response.
    expect(second.session.penaltyMs).toBe(second.penaltyMs)
    expect(third.session.penaltyMs).toBe(second.penaltyMs + third.penaltyMs)
    expect(second.session.currentLevelViews).toBe(2)
  })

  it('gives the allowance back at the next level', async () => {
    const p = await bootPlayer()
    await json('/session/start', {}, {Authorization: `Bearer ${p.sessionToken}`})
    for (let i = 0; i < 3; i++) await view(p.sessionToken)

    clock.advance(LAYOUT.minLegMs + 60_000)
    const res = await json(
      '/session/arrive',
      {samples: parkedAt(p.stops[0]!, clock.now())},
      {Authorization: `Bearer ${p.sessionToken}`},
    )
    const body = (await res.json()) as {ok: boolean; session: {currentLevelViews: number}}
    expect(body.ok).toBe(true)
    expect(body.session.currentLevelViews).toBe(0)

    const afterAdvance = (await (await view(p.sessionToken)).json()) as {penaltyMs: number}
    expect(afterAdvance.penaltyMs).toBe(0)
  })
})

describe('the reward ladder', () => {
  const view = (token: string) =>
    app.request('/session/view', {method: 'POST', headers: {Authorization: `Bearer ${token}`}}, env)

  /** Walk a player to the start of `level`, clearing everything before it. */
  async function climbTo(level: number) {
    const p = await bootPlayer()
    await json('/session/start', {}, {Authorization: `Bearer ${p.sessionToken}`})
    for (let i = 0; i < level - 1; i++) {
      clock.advance(LAYOUT.minLegMs + 60_000)
      await json(
        '/session/arrive',
        {samples: parkedAt(p.stops[i]!, clock.now())},
        {Authorization: `Bearer ${p.sessionToken}`},
      )
    }
    return p
  }

  it('names the rung earned by each level', async () => {
    const p = await bootPlayer()
    await json('/session/start', {}, {Authorization: `Bearer ${p.sessionToken}`})
    clock.advance(LAYOUT.minLegMs + 60_000)
    const res = await json(
      '/session/arrive',
      {samples: parkedAt(p.stops[0]!, clock.now())},
      {Authorization: `Bearer ${p.sessionToken}`},
    )
    const body = (await res.json()) as {reveal: {perk: {rung: number; name: string} | null}}
    expect(body.reveal.perk?.rung).toBe(1)
    expect(body.reveal.perk?.name).toBeTruthy()
  })

  it('rung 2 buys an extra free viewing on later levels', async () => {
    const p = await climbTo(3)
    // One from the base allowance, a second from the rung — both free.
    for (let i = 0; i < 2; i++) {
      const r = (await (await view(p.sessionToken)).json()) as {penaltyMs: number}
      expect(r.penaltyMs, `view ${i + 1}`).toBe(0)
    }
    const third = (await (await view(p.sessionToken)).json()) as {penaltyMs: number}
    expect(third.penaltyMs).toBeGreaterThan(0)
  })

  it('rung 3 gives exactly one free hint, then charges again', async () => {
    const p = await climbTo(4)
    clock.advance(20 * 60_000)
    const hint = (h: string) =>
      json('/session/hint', {rung: h}, {Authorization: `Bearer ${p.sessionToken}`})

    const first = (await (await hint('warm')).json()) as {penaltyMs: number}
    const second = (await (await hint('close')).json()) as {penaltyMs: number}
    expect(first.penaltyMs).toBe(0)
    expect(second.penaltyMs).toBeGreaterThan(0)
  })
})

describe('app — password login', () => {
  const anon = (path: string, body: unknown) =>
    app.request(
      path,
      {method: 'POST', headers: {'content-type': 'application/json'}, body: JSON.stringify(body)},
      env,
    )

  it('signs up against an event code and then plays', async () => {
    const batch = (await (
      await json('/admin/batches', {name: 'Induction', eventCode: 'induct26'})
    ).json()) as {eventCode: string}
    expect(batch.eventCode).toBe('induct26')

    const signup = await anon('/session/signup', {
      eventCode: 'induct26',
      username: '21B-1042',
      name: 'Aditi',
      password: 'a-good-password',
    })
    expect(signup.status).toBe(200)
    const {sessionToken} = (await signup.json()) as {sessionToken: string}

    const start = await app.request(
      '/session/start',
      {method: 'POST', headers: {Authorization: `Bearer ${sessionToken}`}},
      env,
    )
    expect(start.status).toBe(200)
  })

  it('logs a returning player back in', async () => {
    await json('/admin/batches', {name: 'B', eventCode: 'code9'})
    await anon('/session/signup', {eventCode: 'code9', username: 'r1', name: 'Sam', password: 'secret123'})
    const back = await anon('/session/login', {eventCode: 'code9', username: 'r1', password: 'secret123'})
    expect(back.status).toBe(200)
  })

  it('rejects a bad password with 401', async () => {
    await json('/admin/batches', {name: 'B', eventCode: 'code10'})
    await anon('/session/signup', {eventCode: 'code10', username: 'r1', name: 'Sam', password: 'secret123'})
    const bad = await anon('/session/login', {eventCode: 'code10', username: 'r1', password: 'nope'})
    expect(bad.status).toBe(401)
  })

  it('rejects an unknown event code with 404', async () => {
    const res = await anon('/session/signup', {
      eventCode: 'ghost',
      username: 'r1',
      name: 'Sam',
      password: 'secret123',
    })
    expect(res.status).toBe(404)
  })

  it('rejects a short password with 400', async () => {
    await json('/admin/batches', {name: 'B', eventCode: 'code11'})
    const res = await anon('/session/signup', {
      eventCode: 'code11',
      username: 'r1',
      name: 'Sam',
      password: 'x',
    })
    expect(res.status).toBe(400)
  })
})

describe('app — pause, resume, abandon', () => {
  const post = (path: string, token: string) =>
    app.request(path, {method: 'POST', headers: {Authorization: `Bearer ${token}`}}, env)

  async function started() {
    const p = await bootPlayer(['amphitheatre', 'symbieat', 'sibm', 'library', 'fountain'])
    await post('/session/start', p.sessionToken)
    return p
  }

  it('pauses and resumes over HTTP', async () => {
    const p = await started()
    clock.advance(60_000)
    const paused = (await (await post('/session/pause', p.sessionToken)).json()) as {
      session: {status: string; pausedAtMs: number | null}
    }
    expect(paused.session.status).toBe('paused')
    expect(paused.session.pausedAtMs).not.toBeNull()

    clock.advance(10 * 60_000)
    const back = (await (await post('/session/resume', p.sessionToken)).json()) as {
      session: {status: string; pausedTotalMs: number}
    }
    expect(back.session.status).toBe('in_progress')
    expect(back.session.pausedTotalMs).toBe(10 * 60_000)
  })

  it('refuses an arrival while paused, and takes it after resuming', async () => {
    const p = await started()
    await post('/session/pause', p.sessionToken)
    const auth = {Authorization: `Bearer ${p.sessionToken}`}

    const blocked = (await (
      await json('/session/arrive', {samples: parkedAt('amphitheatre', clock.now())}, auth)
    ).json()) as {ok: boolean; failure: string}
    expect(blocked.ok).toBe(false)

    await post('/session/resume', p.sessionToken)
    clock.advance(3 * 60_000)
    const ok = (await (
      await json('/session/arrive', {samples: parkedAt('amphitheatre', clock.now())}, auth)
    ).json()) as {ok: boolean}
    expect(ok.ok).toBe(true)
  })

  it('abandons and stays abandoned', async () => {
    const p = await started()
    clock.advance(5 * 60_000)
    const done = (await (await post('/session/abandon', p.sessionToken)).json()) as {
      session: {status: string; scoreMs: number | null}
    }
    expect(done.session.status).toBe('abandoned')
    expect(done.session.scoreMs).not.toBeNull()

    expect((await post('/session/resume', p.sessionToken)).status).toBe(409)
  })

  it('prepares an ended hunt for replay over HTTP', async () => {
    const p = await started()
    await post('/session/abandon', p.sessionToken)

    const replay = (await (await post('/session/replay', p.sessionToken)).json()) as {
      session: {status: string; startTsMs: number | null}
    }

    expect(replay.session).toMatchObject({status: 'not_started', startTsMs: null})
    expect((await post('/session/start', p.sessionToken)).status).toBe(200)
  })

  it('leaves a hunt nobody paused unchanged, so old sessions still work', async () => {
    const p = await started()
    clock.advance(90_000)
    const state = (await (await json('/session', undefined, {
      Authorization: `Bearer ${p.sessionToken}`,
    })).json()) as {session: {pausedTotalMs: number; pausedAtMs: number | null}}
    expect(state.session.pausedTotalMs).toBe(0)
    expect(state.session.pausedAtMs).toBeNull()
  })
})

describe('app — closing a batch', () => {
  it('ends running hunts and refuses further signups', async () => {
    const batch = (await (
      await json('/admin/batches', {name: 'Old event', eventCode: 'oldev'})
    ).json()) as {id: string}

    const anon = (path: string, body: unknown) =>
      app.request(
        path,
        {method: 'POST', headers: {'content-type': 'application/json'}, body: JSON.stringify(body)},
        env,
      )
    const {sessionToken} = (await (
      await anon('/session/signup', {
        eventCode: 'oldev',
        username: 'r1',
        name: 'A',
        password: 'secret123',
      })
    ).json()) as {sessionToken: string}
    await app.request('/session/start', {method: 'POST', headers: {Authorization: `Bearer ${sessionToken}`}}, env)

    const res = (await (await json(`/admin/batches/${batch.id}/close`, {})).json()) as {
      sessions: number
    }
    expect(res.sessions).toBe(1)

    const state = (await (
      await json('/session', undefined, {Authorization: `Bearer ${sessionToken}`})
    ).json()) as {session: {status: string}}
    expect(state.session.status).toBe('abandoned')

    const late = await anon('/session/signup', {
      eventCode: 'oldev',
      username: 'r2',
      name: 'B',
      password: 'secret123',
    })
    expect(late.status).toBe(409)
  })

  it('needs the admin key', async () => {
    const res = await app.request('/admin/batches/whatever/close', {method: 'POST'}, env)
    expect(res.status).toBe(403)
  })
})

describe('app — practice is decided by the batch, not the browser', () => {
  it('reports isDemo false for a real batch', async () => {
    const p = await bootPlayer(['amphitheatre', 'symbieat', 'sibm', 'library', 'fountain'])
    const state = (await (
      await json('/session', undefined, {Authorization: `Bearer ${p.sessionToken}`})
    ).json()) as {isDemo: boolean}
    expect(state.isDemo).toBe(false)
  })

  it('reports isDemo true for a practice session', async () => {
    const demo = (await (
      await app.request(
        '/demo/session',
        {method: 'POST', headers: {'content-type': 'application/json'}, body: '{}'},
        env,
      )
    ).json()) as {sessionToken: string}
    const state = (await (
      await json('/session', undefined, {Authorization: `Bearer ${demo.sessionToken}`})
    ).json()) as {isDemo: boolean}
    expect(state.isDemo).toBe(true)
  })
})
