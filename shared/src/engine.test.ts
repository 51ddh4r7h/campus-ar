import {beforeEach, describe, expect, it} from 'vitest'
import {HUNT_LIMIT_MS, VALIDATION} from './config'
import {locationById} from './content'
import {createEngine, type EngineDeps} from './engine'
import {elapsedMsOf} from './scoring'
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
  it('gates rungs by order but not by a timer', async () => {
    const batch = await engine.createBatch({name: 'B'})
    const {player} = await engine.registerPlayer({batchId: batch.id, name: 'A', rosterId: 'r1'})
    await engine.startHunt(player.sessionToken)

    // The first hint is available the moment the level starts — no wait.
    // But you cannot skip straight to rung 2.
    await expect(engine.useHint(player.sessionToken, 'close')).rejects.toThrow(/hint_locked/)

    const h1 = await engine.useHint(player.sessionToken, 'warm')
    expect(h1.clue.clueText.warm).not.toBeNull()
    expect(h1.session.penaltyMs).toBe(90_000)

    // The next rung, still with no time elapsed.
    const h2 = await engine.useHint(player.sessionToken, 'close')
    expect(h2.clue.clueText.close).not.toBeNull()
    expect(h2.session.penaltyMs).toBe(180_000)

    const h3 = await engine.useHint(player.sessionToken, 'showLocation')
    expect(h3.clue.revealPoint).not.toBeNull()
    expect(h3.session.penaltyMs).toBe(180_000 + 300_000)
  })

  it('carries the hint penalty into the final score', async () => {
    const batch = await engine.createBatch({name: 'B'})
    const {player} = await engine.registerPlayer({batchId: batch.id, name: 'A', rosterId: 'r1'})
    await engine.startHunt(player.sessionToken)
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

describe('engine — extra looks at the clip', () => {
  it('gives one free look then charges every one after, stacking', async () => {
    const batch = await engine.createBatch({name: 'V'})
    const {player} = await engine.registerPlayer({batchId: batch.id, name: 'A', rosterId: 'r1'})
    await engine.startHunt(player.sessionToken)

    const first = await engine.viewScene(player.sessionToken)
    expect(first.penaltyMs).toBe(0)
    expect(first.session.currentLevelViews).toBe(1)

    const second = await engine.viewScene(player.sessionToken)
    expect(second.penaltyMs).toBe(45_000)
    expect(second.session.penaltyMs).toBe(45_000)

    const third = await engine.viewScene(player.sessionToken)
    expect(third.penaltyMs).toBe(45_000)
    expect(third.session.penaltyMs).toBe(90_000)
    expect(third.session.currentLevelViews).toBe(3)
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
      deps.advance(4 * 60_000)
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

  /**
   * Everyone's clock has to be runnable by everyone else's device.
   *
   * The board carries absolute timestamps rather than a computed duration
   * because the response is cached for ten seconds — a duration would arrive
   * already stale, and a rival's timer would sit ten seconds behind their own.
   * Timestamps do not go stale, so this pins them.
   */
  it('carries enough timing for a viewer to run every clock on the board', async () => {
    const batch = await engine.createBatch({name: 'B'})
    const running = await engine.registerPlayer({batchId: batch.id, name: 'Walking', rosterId: 'r1'})
    const resting = await engine.registerPlayer({batchId: batch.id, name: 'Paused', rosterId: 'r2'})

    await engine.startHunt(running.player.sessionToken)
    await engine.startHunt(resting.player.sessionToken)
    deps.advance(4 * 60_000)
    await engine.pause(resting.player.sessionToken)
    deps.advance(6 * 60_000)

    const rows = await engine.standings(batch.id)
    const walking = rows.find((r) => r.playerName === 'Walking')!
    const paused = rows.find((r) => r.playerName === 'Paused')!

    expect(walking.scoreMs).toBeNull()
    expect(walking.paused).toBe(false)
    expect(elapsedMsOf(walking.timing, deps.now())).toBe(10 * 60_000)

    // A paused clock is stopped, and stays stopped as the viewer's own ticks on.
    expect(paused.paused).toBe(true)
    expect(elapsedMsOf(paused.timing, deps.now())).toBe(4 * 60_000)
    expect(elapsedMsOf(paused.timing, deps.now() + 60_000)).toBe(4 * 60_000)
  })

  it('puts the quicker player first when two are on the same level', async () => {
    const batch = await engine.createBatch({name: 'B'})
    const quick = await engine.registerPlayer({batchId: batch.id, name: 'Quick', rosterId: 'r1'})
    const slow = await engine.registerPlayer({batchId: batch.id, name: 'Slow', rosterId: 'r2'})

    await engine.startHunt(slow.player.sessionToken)
    deps.advance(5 * 60_000)
    await engine.startHunt(quick.player.sessionToken)

    const rows = await engine.standings(batch.id)
    expect(rows.map((r) => r.playerName)).toEqual(['Quick', 'Slow'])
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

describe('engine — content changed under a live batch', () => {
  /** Put a player on a route naming a location the content no longer has. */
  async function strand() {
    const batch = await engine.createBatch({name: 'Old', eventCode: 'old1'})
    const {player} = await engine.registerPlayer({batchId: batch.id, name: 'A', rosterId: 'r1'})
    const route = (await store.getRoute(player.id))!
    await store.putRoute({...route, stops: ['amphitheatre', 'sibm', 'auditorium', 'symbieat', 'library']})
    return {batch, player}
  }

  it('starts the hunt instead of throwing when a stop no longer exists', async () => {
    const {player} = await strand()
    // Before the fix this threw `unknown location "auditorium" in route`, which
    // the Worker turned into a 500 and the client blamed on the network.
    const {clue} = await engine.startHunt(player.sessionToken)
    expect(clue.level).toBe(1)
  })

  it('reissues a route made only of locations that still exist', async () => {
    const {player} = await strand()
    await engine.startHunt(player.sessionToken)
    const route = (await store.getRoute(player.id))!
    for (const id of route.stops) expect(locationById(id), id).toBeDefined()
    expect(route.stops).not.toContain('auditorium')
  })

  it('clears splits that pointed at the old route', async () => {
    const {player} = await strand()
    await store.putSplit({
      playerId: player.id,
      level: 1,
      locationId: 'auditorium',
      reachedTsMs: deps.now(),
      splitMs: 1000,
      hintsUsed: 0,
      penaltyMs: 0,
    })
    await engine.startHunt(player.sessionToken)
    expect(await store.listSplits(player.id)).toHaveLength(0)
  })

  it('rebuilds a pool built before the difficulty ramp, rather than serving its shape', async () => {
    // These resolve fine — they just open on a Difficult scene, which is the
    // thing the ramp exists to prevent. Resolvable is not the same as current.
    const batch = await engine.createBatch({name: 'PreRamp', eventCode: 'preramp'})
    const stored = (await store.getBatch(batch.id))!
    await store.putBatch({
      ...stored,
      pool: {
        ...stored.pool,
        routes: stored.pool.routes.map((r) => ({
          ...r,
          stops: ['fountain', 'sibm', 'symbieat', 'outside-c-hall', 'behind-ssbf'] as typeof r.stops,
        })),
      },
    })
    const {player} = await engine.registerPlayer({batchId: batch.id, name: 'C', rosterId: 'r3'})
    const stops = (await store.getRoute(player.id))!.stops
    const tiers = stops.map((id) => locationById(id)!.difficulty)
    expect(tiers[0]).toBe(1)
    for (let i = 1; i < tiers.length; i++) expect(tiers[i]!).toBeGreaterThanOrEqual(tiers[i - 1]!)
  })

  it('rebuilds a batch pool whose routes are all stale, so new players are not stranded too', async () => {
    const batch = await engine.createBatch({name: 'Stale', eventCode: 'stale1'})
    const stored = (await store.getBatch(batch.id))!
    await store.putBatch({
      ...stored,
      pool: {
        ...stored.pool,
        routes: stored.pool.routes.map((r) => ({
          ...r,
          stops: ['amphitheatre', 'sibm', 'auditorium', 'symbieat', 'library'] as typeof r.stops,
        })),
      },
    })
    const {player} = await engine.registerPlayer({batchId: batch.id, name: 'B', rosterId: 'r2'})
    const route = (await store.getRoute(player.id))!
    for (const id of route.stops) expect(locationById(id), id).toBeDefined()
  })
})

describe('engine — pause, resume, abandon', () => {
  async function playing() {
    const batch = await engine.createBatch({name: 'P', eventCode: 'pause1'})
    const {player} = await engine.registerPlayer({batchId: batch.id, name: 'A', rosterId: 'r1'})
    await engine.startHunt(player.sessionToken)
    return player
  }

  it('does not count time spent paused', async () => {
    const p = await playing()
    deps.advance(60_000)
    await engine.pause(p.sessionToken)
    deps.advance(10 * 60_000) // ten minutes away
    const s = await engine.resume(p.sessionToken)
    // A minute of play, ten minutes of nothing.
    expect(elapsedMsOf(s, deps.now())).toBe(60_000)
    expect(s.pausedTotalMs).toBe(10 * 60_000)
  })

  it('holds the clock still while paused', async () => {
    const p = await playing()
    deps.advance(30_000)
    const paused = await engine.pause(p.sessionToken)
    const at = elapsedMsOf(paused, deps.now())
    deps.advance(5 * 60_000)
    expect(elapsedMsOf(paused, deps.now())).toBe(at)
  })

  it('refuses an arrival while paused', async () => {
    const p = await playing()
    await engine.pause(p.sessionToken)
    const route = (await store.getRoute(p.id))!
    const res = await engine.arrive(
      p.sessionToken,
      parkedAt(locationById(route.stops[0]!)!, deps.now()),
    )
    expect(res.ok).toBe(false)
    expect(res.failure).toBe('not_in_progress')
  })

  it('accepts an arrival again after resuming', async () => {
    const p = await playing()
    await engine.pause(p.sessionToken)
    deps.advance(60_000)
    await engine.resume(p.sessionToken)
    deps.advance(2 * 60_000)
    const route = (await store.getRoute(p.id))!
    const res = await engine.arrive(
      p.sessionToken,
      parkedAt(locationById(route.stops[0]!)!, deps.now()),
    )
    expect(res.ok).toBe(true)
  })

  it('survives several pauses, banking each one', async () => {
    const p = await playing()
    for (let i = 0; i < 3; i++) {
      deps.advance(20_000)
      await engine.pause(p.sessionToken)
      deps.advance(60_000)
      await engine.resume(p.sessionToken)
    }
    const s = (await store.getSession(p.id))!
    expect(s.pausedTotalMs).toBe(3 * 60_000)
    expect(elapsedMsOf(s, deps.now())).toBe(3 * 20_000)
  })

  it('pausing twice is not an error and does not lose the first pause', async () => {
    const p = await playing()
    deps.advance(10_000)
    const a = await engine.pause(p.sessionToken)
    deps.advance(60_000)
    const b = await engine.pause(p.sessionToken)
    expect(b.pausedAtMs).toBe(a.pausedAtMs)
  })

  it('abandoning ends the hunt with a score for what was reached', async () => {
    const p = await playing()
    deps.advance(4 * 60_000)
    const s = await engine.abandon(p.sessionToken)
    expect(s.status).toBe('abandoned')
    expect(s.endTsMs).not.toBeNull()
    expect(s.scoreMs).not.toBeNull()
  })

  it('cannot be resumed once abandoned', async () => {
    const p = await playing()
    await engine.abandon(p.sessionToken)
    await expect(engine.resume(p.sessionToken)).rejects.toThrow()
  })

  it('abandons from paused too, and excludes the time away', async () => {
    const p = await playing()
    deps.advance(90_000)
    await engine.pause(p.sessionToken)
    deps.advance(30 * 60_000)
    const s = await engine.abandon(p.sessionToken)
    expect(elapsedMsOf(s, deps.now())).toBe(90_000)
  })
})

describe('engine — sessions and batches that outlive their event', () => {
  async function playing(code = 'stale-a') {
    const batch = await engine.createBatch({name: 'S', eventCode: code})
    const {player} = await engine.registerPlayer({batchId: batch.id, name: 'A', rosterId: 'r1'})
    await engine.startHunt(player.sessionToken)
    return {batch, player}
  }

  it('ends a hunt the moment the time limit is reached', async () => {
    const {player} = await playing()
    deps.advance(HUNT_LIMIT_MS + 60_000)
    // Any call is enough — the check sits at the auth boundary.
    const state = await engine.getState(player.sessionToken)
    expect(state.session.status).toBe('abandoned')
    expect(state.session.endTsMs).not.toBeNull()
  })

  it('leaves a hunt inside the limit alone', async () => {
    const {player} = await playing('stale-b')
    deps.advance(HUNT_LIMIT_MS - 60_000)
    const state = await engine.getState(player.sessionToken)
    expect(state.session.status).toBe('in_progress')
  })

  it('brings the deadline forward by the penalties taken', async () => {
    const {player} = await playing('stale-pen')
    // All three hint rungs — 1:30 + 1:30 + 5:00 = 8:00 off the clock.
    await engine.useHint(player.sessionToken, 'warm')
    await engine.useHint(player.sessionToken, 'close')
    await engine.useHint(player.sessionToken, 'showLocation')

    // Still fine at 16 minutes of real time — 16:00 + 8:00 = 24:00.
    deps.advance(16 * 60_000)
    expect((await engine.getState(player.sessionToken)).session.status).toBe('in_progress')

    // But 18 minutes of real time plus 8:00 of penalty is over the 25.
    deps.advance(2 * 60_000)
    expect((await engine.getState(player.sessionToken)).session.status).toBe('abandoned')
  })

  it('records the deadline as the end, not whenever the player reopened the app', async () => {
    const {player} = await playing('stale-d')
    const startedAt = deps.now()
    // Runs out, then the phone goes in a pocket for an hour.
    deps.advance(HUNT_LIMIT_MS + 60 * 60_000)

    const state = await engine.getState(player.sessionToken)

    expect(state.session.status).toBe('abandoned')
    // Ended at 25:00 exactly — not at the 85 minutes of wall clock that passed.
    expect(state.session.endTsMs).toBe(startedAt + HUNT_LIMIT_MS)
    expect(elapsedMsOf(state.session, deps.now())).toBe(HUNT_LIMIT_MS)
  })

  it('gives back the time a player spent paused', async () => {
    const {player} = await playing('stale-e')
    deps.advance(10 * 60_000)
    await engine.pause(player.sessionToken)
    deps.advance(30 * 60_000) // half an hour stopped
    await engine.resume(player.sessionToken)

    // 10 minutes used, so 15 remain despite 40 minutes of wall clock.
    deps.advance(14 * 60_000)
    expect((await engine.getState(player.sessionToken)).session.status).toBe('in_progress')
    deps.advance(2 * 60_000)
    expect((await engine.getState(player.sessionToken)).session.status).toBe('abandoned')
  })

  it('ranks a player who ran out of time on how far they got', async () => {
    const batch = await engine.createBatch({name: 'Timed', eventCode: 'timed-1'})
    const far = (await engine.registerPlayer({batchId: batch.id, name: 'Far', rosterId: 'r1'})).player
    const near = (await engine.registerPlayer({batchId: batch.id, name: 'Near', rosterId: 'r2'})).player

    for (const p of [far, near]) await engine.startHunt(p.sessionToken)
    const stops = async (id: string) => (await store.getRoute(id))!.stops
    // Far reaches two locations, Near only one; then both run out.
    for (const [p, levels] of [[far, 2] as const, [near, 1] as const]) {
      for (let i = 0; i < levels; i++) {
        deps.advance(3 * 60_000)
        await engine.arrive(p.sessionToken, parkedAt(locationById((await stops(p.id))[i]!)!, deps.now()))
      }
    }
    deps.advance(HUNT_LIMIT_MS)
    for (const p of [far, near]) await engine.getState(p.sessionToken)

    const rows = await engine.standings(batch.id)
    // Both are on the board at all — that is the point — and the one who got
    // further is above the one who did not.
    expect(rows.map((r) => r.playerName)).toEqual(['Far', 'Near'])
    // Scored on progress, not on a par they never played to the end of.
    expect(rows[0]!.scoreMs).toBeNull()
    expect(rows[0]!.level).toBe(3)
    expect(rows[1]!.level).toBe(2)
  })

  it('does not count paused time towards the limit', async () => {
    const {player} = await playing('stale-c')
    deps.advance(60_000)
    await engine.pause(player.sessionToken)
    deps.advance(HUNT_LIMIT_MS * 2) // a very long lunch
    const s = await engine.resume(player.sessionToken)
    expect(s.status).toBe('in_progress')
  })

  it('closing a batch ends the hunts still running in it', async () => {
    const {batch, player} = await playing('stale-d')
    const res = await engine.closeBatch(batch.id)
    expect(res.sessions).toBe(1)
    const state = await engine.getState(player.sessionToken)
    expect(state.session.status).toBe('abandoned')
  })

  it('a closed batch takes no more signups', async () => {
    const {batch} = await playing('stale-e')
    await engine.closeBatch(batch.id)
    await expect(
      engine.signup({eventCode: 'stale-e', username: 'new', name: 'N', password: 'secret123'}),
    ).rejects.toThrow(/closed/i)
  })

  it('closing twice is harmless', async () => {
    const {batch} = await playing('stale-f')
    await engine.closeBatch(batch.id)
    const again = await engine.closeBatch(batch.id)
    expect(again.sessions).toBe(0)
  })
})

describe('engine — organiser reset', () => {
  it('puts a finished player back at the start with a clean slate', async () => {
    const batch = await engine.createBatch({name: 'Batch R'})
    const {player} = await engine.registerPlayer({
      batchId: batch.id,
      name: 'Maya R.',
      rosterId: 'S-001',
    })
    await playThrough(player.sessionToken)

    const before = (await store.getRoute(player.id))!
    expect((await engine.getState(player.sessionToken)).session.status).toBe('complete')

    const session = await engine.resetPlayer(batch.id, player.id)

    // A hunt that has not started: no clock, no score, back on level one.
    expect(session.status).toBe('not_started')
    expect(session.startTsMs).toBeNull()
    expect(session.scoreMs).toBeNull()
    expect(session.currentLevel).toBe(1)
    expect(session.penaltyMs).toBe(0)

    // The old run's finds do not count towards the new one.
    expect(await store.listSplits(player.id)).toHaveLength(0)

    // A route they can actually play, and the account is untouched — whatever
    // is signed in on their phone stays signed in.
    const after = (await store.getRoute(player.id))!
    expect(after.stops).toHaveLength(5)
    expect(after.parTotalMs).toBeGreaterThan(0)
    const same = await store.getPlayer(player.id)
    expect(same!.sessionToken).toBe(player.sessionToken)
    expect(same!.rosterId).toBe('S-001')

    // And it is playable again from the token they already hold.
    const started = await engine.startHunt(player.sessionToken)
    expect(started.clue.level).toBe(1)
    expect(before.stops.length).toBe(5)
  })

  it('resets a hunt that is still running', async () => {
    const batch = await engine.createBatch({name: 'Batch R2'})
    const {player} = await engine.registerPlayer({
      batchId: batch.id,
      name: 'Rohan M.',
      rosterId: 'S-002',
    })
    await engine.startHunt(player.sessionToken)
    deps.advance(20 * 60_000)

    const session = await engine.resetPlayer(batch.id, player.id)

    expect(session.status).toBe('not_started')
    expect(session.startTsMs).toBeNull()
  })

  it('refuses a player who is not in that batch', async () => {
    const a = await engine.createBatch({name: 'Batch A'})
    const b = await engine.createBatch({name: 'Batch B'})
    const {player} = await engine.registerPlayer({
      batchId: a.id,
      name: 'Maya R.',
      rosterId: 'S-001',
    })

    await expect(engine.resetPlayer(b.id, player.id)).rejects.toThrow(/player_not_found|No such player/)
    await expect(engine.resetPlayer(a.id, 'nobody')).rejects.toThrow(/player_not_found|No such player/)
  })
})

describe('engine — player replay', () => {
  const seat = async (batchId: string, rosterId: string) =>
    (await engine.registerPlayer({batchId, name: `P-${rosterId}`, rosterId})).player

  it('swaps a finished run for a fresh, playable route', async () => {
    const batch = await engine.createBatch({name: 'R'})
    const player = await seat(batch.id, 'S-001')
    await playThrough(player.sessionToken)
    expect(await store.listSplits(player.id)).toHaveLength(5)

    const fresh = await engine.replay(player.sessionToken)

    expect(fresh.status).toBe('not_started')
    expect(fresh.startTsMs).toBeNull()
    expect(fresh.scoreMs).toBeNull()
    expect(fresh.currentLevel).toBe(1)
    // The old run's finds do not count towards the new one.
    expect(await store.listSplits(player.id)).toHaveLength(0)
    await expect(engine.startHunt(player.sessionToken)).resolves.toMatchObject({
      session: {status: 'in_progress'},
      clue: {level: 1},
    })
  })

  it('does not send them round the same five places again', async () => {
    const batch = await engine.createBatch({name: 'R2'})
    const player = await seat(batch.id, 'S-002')
    await playThrough(player.sessionToken)
    const walked = (await store.getRoute(player.id))!.stops

    await engine.replay(player.sessionToken)

    // Five stops drawn twice from nine must share at least one, so a clean
    // sheet is impossible — but it must not be the same walk over again.
    const next = (await store.getRoute(player.id))!.stops
    expect(next).not.toEqual(walked)
    expect(next.filter((id) => walked.includes(id)).length).toBeLessThanOrEqual(2)
  })

  it('keeps the account and its sign-in untouched', async () => {
    const batch = await engine.createBatch({name: 'R3'})
    const player = await seat(batch.id, 'S-003')
    await engine.startHunt(player.sessionToken)
    await engine.abandon(player.sessionToken)

    await engine.replay(player.sessionToken)

    const same = await store.getPlayer(player.id)
    expect(same!.sessionToken).toBe(player.sessionToken)
    expect(same!.rosterId).toBe('S-003')
  })

  it('refuses while the hunt is still running', async () => {
    const batch = await engine.createBatch({name: 'R4'})
    const player = await seat(batch.id, 'S-004')
    await expect(engine.replay(player.sessionToken)).rejects.toThrow(/Finish or end/)
    await engine.startHunt(player.sessionToken)
    await expect(engine.replay(player.sessionToken)).rejects.toThrow(/Finish or end/)
  })

  it('does not reopen a closed event', async () => {
    const batch = await engine.createBatch({name: 'R5'})
    const player = await seat(batch.id, 'S-005')
    await engine.startHunt(player.sessionToken)
    await engine.abandon(player.sessionToken)
    await engine.closeBatch(batch.id)

    await expect(engine.replay(player.sessionToken)).rejects.toThrow(/signups_closed/)
  })
})

describe('engine — post-game feedback', () => {
  const seat = async (batchId: string, rosterId: string) =>
    (await engine.registerPlayer({batchId, name: `P-${rosterId}`, rosterId})).player

  it('stores the survey as a feedback_submitted event', async () => {
    const batch = await engine.createBatch({name: 'F1'})
    const player = await seat(batch.id, 'S-001')
    await playThrough(player.sessionToken)

    await engine.submitFeedback(player.sessionToken, {
      stars: 4,
      clues: 'right',
      navigation: 'confident',
      friction: 'none',
      recommend: 'yes',
    })

    const events = await store.listEvents(batch.id, 100)
    const fb = events.filter((e) => e.type === 'feedback_submitted')
    expect(fb).toHaveLength(1)
    expect(fb[0]!.payload).toEqual({
      stars: 4,
      clues: 'right',
      navigation: 'confident',
      friction: 'none',
      recommend: 'yes',
    })
  })

  it('rejects a bad token', async () => {
    await expect(
      engine.submitFeedback('nope', {
        stars: 3,
        clues: 'right',
        navigation: 'unsure',
        friction: 'gps',
        recommend: 'maybe',
      }),
    ).rejects.toThrow(/bad_token/)
  })
})
