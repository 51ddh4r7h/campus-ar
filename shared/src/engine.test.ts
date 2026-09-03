import {beforeEach, describe, expect, it} from 'vitest'
import {VALIDATION} from './config'
import {locationById} from './content'
import {createEngine, type EngineDeps} from './engine'
import {InMemoryStore} from './store'
import type {GameLocation, GeoSample} from './types'

/** A controllable clock + deterministic id source for the engine. */
class TestDeps implements EngineDeps {
  t = 1_000_000
  private n = 0
  now(): number {
    return this.t
  }
  randomId(): string {
    return `id-${++this.n}`
  }
  randomToken(): string {
    return `tok-${++this.n}`
  }
  // Not real hashing — the engine only needs a deterministic round trip.
  async hashPassword(pw: string): Promise<string> {
    return `h:${pw}`
  }
  async verifyPassword(pw: string, stored: string): Promise<boolean> {
    return stored === `h:${pw}`
  }
  advance(ms: number): void {
    this.t += ms
  }
}

const parkedAt = (loc: GameLocation, endTsMs: number): GeoSample[] => {
  const out: GeoSample[] = []
  for (let t = endTsMs - (VALIDATION.dwellMs + 4_000); t <= endTsMs; t += 4_000) {
    out.push({lat: loc.lat, lng: loc.lng, accuracyM: 0, tsMs: t, simulated: true})
  }
  return out
}

let store: InMemoryStore
let deps: TestDeps
let engine: ReturnType<typeof createEngine>

beforeEach(() => {
  store = new InMemoryStore()
  deps = new TestDeps()
  engine = createEngine(store, deps)
})

async function playThrough(token: string): Promise<void> {
  const {clue} = await engine.startHunt(token)
  let level = clue.level
  while (level <= 5) {
    const loc = locationById(
      (await store.getRoute(
        (await store.getPlayerByToken(token))!.id,
      ))!.stops[level - 1]!,
    )!
    deps.advance(3 * 60_000) // spend three minutes on the leg
    const res = await engine.arrive(token, parkedAt(loc, deps.now()))
    expect(res.ok, `level ${level} should validate`).toBe(true)
    expect(res.split?.level).toBe(level)
    expect(res.reveal?.locationName).toBe(loc.name)
    expect(res.reveal?.movie.title).toBe(loc.movie.title)
    if (res.session.status === 'complete') break
    level = res.nextClue!.level
  }
}

describe('engine — full playthrough', () => {
  it('registers, plays five levels, scores against par', async () => {
    const batch = await engine.createBatch({name: 'Batch A'})
    const {player} = await engine.registerPlayer({
      batchId: batch.id,
      name: 'Maya R.',
      rosterId: 'S-001',
    })

    await playThrough(player.sessionToken)

    const {session, splits} = await engine.getState(player.sessionToken)
    expect(session.status).toBe('complete')
    expect(session.currentLevel).toBe(6)
    expect(splits).toHaveLength(5)
    expect(session.scoreMs).not.toBeNull()
    const route = (await store.getRoute(player.id))!
    const elapsed = session.endTsMs! - session.startTsMs!
    expect(session.scoreMs).toBe(elapsed + session.penaltyMs - route.parTotalMs)

    const events = store.allEvents().map((e) => e.type)
    expect(events).toContain('hunt_started')
    expect(events.filter((t) => t === 'location_reached')).toHaveLength(5)
    expect(events).toContain('hunt_completed')
  })

  it('gives two players in a batch different routes', async () => {
    const batch = await engine.createBatch({name: 'Batch B'})
    const a = await engine.registerPlayer({batchId: batch.id, name: 'A', rosterId: 'r1'})
    const b = await engine.registerPlayer({batchId: batch.id, name: 'B', rosterId: 'r2'})
    const ra = (await store.getRoute(a.player.id))!.stops.join('>')
    const rb = (await store.getRoute(b.player.id))!.stops.join('>')
    expect(ra).not.toBe(rb)
  })

  it('honours a pinned route (demo)', async () => {
    const batch = await engine.createBatch({name: 'Batch P'})
    const pinned = ['amphitheatre', 'symbieat', 'sibm', 'library', 'fountain']
    const {player} = await engine.registerPlayer({
      batchId: batch.id,
      name: 'Demo',
      rosterId: 'd1',
      pinnedRoute: pinned,
    })
    expect((await store.getRoute(player.id))!.stops).toEqual(pinned)
  })

  it('rejects a malformed pinned route', async () => {
    const batch = await engine.createBatch({name: 'Batch Q'})
    await expect(
      engine.registerPlayer({batchId: batch.id, name: 'x', rosterId: 'q1', pinnedRoute: ['amphitheatre', 'nope', 'a', 'b', 'c']}),
    ).rejects.toThrow()
  })

  it('re-registering the same roster id is idempotent', async () => {
    const batch = await engine.createBatch({name: 'Batch C'})
    const first = await engine.registerPlayer({batchId: batch.id, name: 'A', rosterId: 'r1'})
    const again = await engine.registerPlayer({batchId: batch.id, name: 'A', rosterId: 'r1'})
    expect(again.player.id).toBe(first.player.id)
  })
})

describe('engine — nearby probe', () => {
  it('reports dwell progress without advancing the level', async () => {
    const batch = await engine.createBatch({name: 'B'})
    const {player} = await engine.registerPlayer({batchId: batch.id, name: 'A', rosterId: 'r1'})
    await engine.startHunt(player.sessionToken)
    const route = (await store.getRoute(player.id))!
    const loc = locationById(route.stops[0]!)!
    deps.advance(60_000)

    const brief = await engine.nearby(player.sessionToken, parkedAt(loc, deps.now()).slice(-2))
    expect(brief.atTarget).toBe(true)
    expect(brief.dwellMs).toBeLessThan(brief.dwellNeededMs)

    const full = await engine.nearby(player.sessionToken, parkedAt(loc, deps.now()))
    expect(full.dwellMs).toBeGreaterThanOrEqual(full.dwellNeededMs)

    // Still on level 1 — nearby never mutates.
    const {session} = await engine.getState(player.sessionToken)
    expect(session.currentLevel).toBe(1)
    expect(await store.listSplits(player.id)).toHaveLength(0)
  })
})

describe('engine — progression rules', () => {
  it('rejects arrival before the hunt starts', async () => {
    const batch = await engine.createBatch({name: 'B'})
    const {player} = await engine.registerPlayer({batchId: batch.id, name: 'A', rosterId: 'r1'})
    const res = await engine.arrive(player.sessionToken, [])
    expect(res).toMatchObject({ok: false, failure: 'not_in_progress'})
  })

  it('does not advance the level on a wrong-location arrival', async () => {
    const batch = await engine.createBatch({name: 'B'})
    const {player} = await engine.registerPlayer({batchId: batch.id, name: 'A', rosterId: 'r1'})
    await engine.startHunt(player.sessionToken)
    const route = (await store.getRoute(player.id))!
    const wrong = locationById(route.stops[2]!)! // a later stop
    deps.advance(60_000)
    const res = await engine.arrive(player.sessionToken, parkedAt(wrong, deps.now()))
    expect(res.ok).toBe(false)
    expect(res.failure).toBe('level_locked')
    const {session} = await engine.getState(player.sessionToken)
    expect(session.currentLevel).toBe(1)
    expect(store.allEvents().map((e) => e.type)).toContain('skip_attempt')
  })
})

describe('engine — hints', () => {
  it('gates rungs by order and by time on the level', async () => {
    const batch = await engine.createBatch({name: 'B'})
    const {player} = await engine.registerPlayer({batchId: batch.id, name: 'A', rosterId: 'r1'})
    await engine.startHunt(player.sessionToken)

    // Too soon for the first hint.
    await expect(engine.useHint(player.sessionToken, 'warm')).rejects.toThrow()
    // Can't skip straight to rung 2.
    deps.advance(5 * 60_000)
    await expect(engine.useHint(player.sessionToken, 'close')).rejects.toThrow()

    const h1 = await engine.useHint(player.sessionToken, 'warm')
    expect(h1.clue.clueText.warm).not.toBeNull()
    expect(h1.session.penaltyMs).toBe(90_000)

    deps.advance(4 * 60_000)
    const h2 = await engine.useHint(player.sessionToken, 'close')
    expect(h2.clue.clueText.close).not.toBeNull()
    expect(h2.session.penaltyMs).toBe(180_000)
  })

  it('carries the hint penalty into the final score', async () => {
    const batch = await engine.createBatch({name: 'B'})
    const {player} = await engine.registerPlayer({batchId: batch.id, name: 'A', rosterId: 'r1'})
    await engine.startHunt(player.sessionToken)
    deps.advance(5 * 60_000)
    await engine.useHint(player.sessionToken, 'warm')

    // Finish level 1 and the rest.
    const route = (await store.getRoute(player.id))!
    let level = 1
    while (level <= 5) {
      const loc = locationById(route.stops[level - 1]!)!
      deps.advance(2 * 60_000)
      const res = await engine.arrive(player.sessionToken, parkedAt(loc, deps.now()))
      expect(res.ok).toBe(true)
      if (level === 1) expect(res.split!.penaltyMs).toBe(90_000)
      if (res.session.status === 'complete') break
      level = res.nextClue!.level
    }
    const {session} = await engine.getState(player.sessionToken)
    expect(session.penaltyMs).toBe(90_000)
  })
})

describe('engine — standings', () => {
  it('ranks finishers by score and marks self', async () => {
    const batch = await engine.createBatch({name: 'B'})
    const p1 = await engine.registerPlayer({batchId: batch.id, name: 'Fast', rosterId: 'r1'})
    const p2 = await engine.registerPlayer({batchId: batch.id, name: 'Slow', rosterId: 'r2'})

    await playThrough(p1.player.sessionToken)
    // p2 takes much longer per leg.
    const t0 = deps.t
    const s2 = await engine.startHunt(p2.player.sessionToken)
    let level = s2.clue.level
    const route2 = (await store.getRoute(p2.player.id))!
    while (level <= 5) {
      deps.advance(8 * 60_000)
      const res = await engine.arrive(
        p2.player.sessionToken,
        parkedAt(locationById(route2.stops[level - 1]!)!, deps.now()),
      )
      if (res.session.status === 'complete') break
      level = res.nextClue!.level
    }
    expect(deps.t).toBeGreaterThan(t0)

    const rows = await engine.standings(batch.id)
    expect(rows[0]!.playerName).toBe('Fast')
    // The board is impersonal; the Worker marks the self row from playerId.
    expect(rows[0]!.playerId).toBe(p1.player.id)
    expect(rows[0]!.rank).toBe(1)
    expect(rows[1]!.playerName).toBe('Slow')
    expect(rows[0]!.scoreMs!).toBeLessThan(rows[1]!.scoreMs!)
  })
})

describe('engine — password signup and login', () => {
  it('creates an account against the batch code and assigns a route', async () => {
    const batch = await engine.createBatch({name: 'Induction 2026', eventCode: 'induct26'})
    const {player, session} = await engine.signup({
      eventCode: 'induct26',
      username: '21B-1042',
      name: 'Aditi',
      password: 'a-good-password',
    })
    expect(player.rosterId).toBe('21B-1042')
    expect(player.name).toBe('Aditi')
    expect(player.batchId).toBe(batch.id)
    expect(session.status).toBe('not_started')
    const route = await store.getRoute(player.id)
    expect(route?.stops).toHaveLength(5)
  })

  it('auto-generates a code when none is given', async () => {
    const batch = await engine.createBatch({name: 'Group A / Blue'})
    expect(batch.eventCode).toMatch(/^group-a-blue-[a-z0-9]{1,3}$/)
  })

  it('logs a returning player back in with the same token', async () => {
    await engine.createBatch({name: 'B', eventCode: 'code1'})
    const first = await engine.signup({
      eventCode: 'code1',
      username: 'r1',
      name: 'Sam',
      password: 'secret123',
    })
    const back = await engine.login({eventCode: 'code1', username: 'r1', password: 'secret123'})
    expect(back.player.sessionToken).toBe(first.player.sessionToken)
  })

  it('rejects a second signup on a claimed roll number', async () => {
    await engine.createBatch({name: 'B', eventCode: 'code2'})
    await engine.signup({eventCode: 'code2', username: 'r1', name: 'Sam', password: 'secret123'})
    await expect(
      engine.signup({eventCode: 'code2', username: 'r1', name: 'Imposter', password: 'other-pass'}),
    ).rejects.toThrow(/already registered/i)
  })

  it('rejects login with the wrong password', async () => {
    await engine.createBatch({name: 'B', eventCode: 'code3'})
    await engine.signup({eventCode: 'code3', username: 'r1', name: 'Sam', password: 'secret123'})
    await expect(
      engine.login({eventCode: 'code3', username: 'r1', password: 'wrong'}),
    ).rejects.toThrow()
  })

  it('rejects an unknown event code', async () => {
    await expect(
      engine.signup({eventCode: 'nope', username: 'r1', name: 'Sam', password: 'secret123'}),
    ).rejects.toThrow(/no event/i)
  })

  it('lets a pre-registered magic-link player claim their spot with a password', async () => {
    const batch = await engine.createBatch({name: 'B', eventCode: 'code4'})
    const pre = await engine.registerPlayer({batchId: batch.id, name: 'Placeholder', rosterId: 'r9'})
    const claimed = await engine.signup({
      eventCode: 'code4',
      username: 'r9',
      name: 'Real Name',
      password: 'claimed-pass',
    })
    // Same player row, same route — just a password and the real name now.
    expect(claimed.player.id).toBe(pre.player.id)
    expect(claimed.player.name).toBe('Real Name')
    expect(claimed.player.sessionToken).toBe(pre.player.sessionToken)
  })

  it('refuses signup once the batch is closed', async () => {
    const batch = await engine.createBatch({name: 'B', eventCode: 'code5'})
    await store.putBatch({...(await store.getBatch(batch.id))!, status: 'closed'})
    await expect(
      engine.signup({eventCode: 'code5', username: 'r1', name: 'Sam', password: 'secret123'}),
    ).rejects.toThrow(/closed/i)
  })
})
