import {Hono} from 'hono'
import {cors} from 'hono/cors'
import {HTTPException} from 'hono/http-exception'
import {
  EngineError,
  computeAnalytics,
  LEVEL_COUNT,
  LOCATION_POOL_SIZE,
  createEngine,
  type EngineDeps,
  type GameStore,
} from '@cmh/shared'
import type {Env} from './env'
import {readCached, writeCached} from './standings-cache'
import {hashPassword, verifyPassword} from './password'
import {
  BadInput,
  parseCreateBatch,
  parseDemoSession,
  parseCrumbs,
  parseFeedback,
  parseHintRung,
  parseRegisterPlayers,
  parseSamples,
  parseSignup,
  parseLogin,
} from './guards'

/**
 * How many events one report will read.
 *
 * Two hundred players generate on the order of thirty events each, so this
 * clears a full induction several times over. It exists so a batch that ran
 * for a week cannot turn a dashboard refresh into an unbounded scan.
 */
const ANALYTICS_EVENT_LIMIT = 20_000

const realDeps: EngineDeps = {
  now: () => Date.now(),
  randomId: () => crypto.randomUUID(),
  randomToken: () =>
    crypto.randomUUID().replace(/-/g, '') + crypto.randomUUID().replace(/-/g, ''),
  hashPassword,
  verifyPassword,
}

const bearer = (auth: string | undefined): string => {
  const token = auth?.match(/^Bearer\s+(.+)$/i)?.[1]
  if (!token) throw new HTTPException(401, {message: 'missing bearer token'})
  return token
}

/**
 * The game API as a Hono app. `makeStore` builds a GameStore from the request's
 * bindings — the Worker passes a D1Store; tests could pass an in-memory one.
 */
export const createApp = (
  makeStore: (env: Env) => GameStore,
  deps: EngineDeps = realDeps,
) => {
  const app = new Hono<{Bindings: Env}>()
  app.use('/*', cors())

  const engineFor = (env: Env) => createEngine(makeStore(env), deps)

  /**
   * Admin routes fail closed. These endpoints hand out every player's session
   * token, so an unconfigured ADMIN_KEY must lock the door rather than leave it
   * open — set it with `wrangler secret put ADMIN_KEY`, or in worker/.dev.vars
   * for local development.
   */
  const requireAdmin = (env: Env | undefined, key: string | undefined): void => {
    if (!env?.ADMIN_KEY) {
      throw new HTTPException(503, {message: 'admin routes are not configured'})
    }
    if (key !== env.ADMIN_KEY) {
      throw new HTTPException(403, {message: 'bad admin key'})
    }
  }

  app.get('/health', (c) =>
    c.json({
      ok: true,
      service: 'campus-movie-hunt-api',
      levels: LEVEL_COUNT,
      locationPool: LOCATION_POOL_SIZE,
    }),
  )

  app.post('/admin/batches', async (c) => {
    requireAdmin(c.env, c.req.header('X-Admin-Key'))
    const body = parseCreateBatch(await c.req.json())
    const batchInput: Parameters<ReturnType<typeof engineFor>['createBatch']>[0] = {
      name: body.name,
      isDemo: body.demo,
    }
    if (body.eventCode) batchInput.eventCode = body.eventCode
    const batch = await engineFor(c.env).createBatch(batchInput)
    return c.json({
      id: batch.id,
      name: batch.name,
      status: batch.status,
      isDemo: batch.isDemo,
      eventCode: batch.eventCode,
      poolSize: batch.pool.routes.length,
      relaxed: batch.pool.relaxed,
      stats: batch.pool.stats,
    })
  })

  app.get('/admin/batches', async (c) => {
    requireAdmin(c.env, c.req.header('X-Admin-Key'))
    const store = makeStore(c.env)
    const batches = await store.listBatches()
    // Counts are independent. Waiting for each D1 read in series made the
    // console slower in direct proportion to the number of past events.
    const rows = await Promise.all(
      batches.map(async (b) => {
        const players = await store.listPlayers(b.id)
        return {
          id: b.id,
          name: b.name,
          status: b.status,
          isDemo: b.isDemo,
          eventCode: b.eventCode,
          createdAtMs: b.createdAtMs,
          playerCount: players.length,
        }
      }),
    )
    return c.json({batches: rows})
  })

  /** The roster with its personal links — how an organiser hands the game out. */
  app.get('/admin/batches/:id/players', async (c) => {
    requireAdmin(c.env, c.req.header('X-Admin-Key'))
    const store = makeStore(c.env)
    const batchId = c.req.param('id')
    const players = await store.listPlayers(batchId)
    // Every row is independent; fetch route/session pairs concurrently so a
    // large cohort does not turn this endpoint into a serial D1 waterfall.
    const rows = await Promise.all(
      players.map(async (p) => {
        const [route, session] = await Promise.all([
          store.getRoute(p.id),
          store.getSession(p.id),
        ])
        return {
          playerId: p.id,
          name: p.name,
          rosterId: p.rosterId,
          sessionToken: p.sessionToken,
          stops: route?.stops ?? [],
          status: session?.status ?? 'not_started',
          currentLevel: session?.currentLevel ?? 1,
          scoreMs: session?.scoreMs ?? null,
        }
      }),
    )
    return c.json({players: rows})
  })

  app.post('/admin/batches/:id/players', async (c) => {
    requireAdmin(c.env, c.req.header('X-Admin-Key'))
    const store = makeStore(c.env)
    const engine = engineFor(c.env)
    const body = parseRegisterPlayers(await c.req.json())
    const batchId = c.req.param('id')
    const players = []
    for (const p of body.players) {
      const reg: Parameters<typeof engine.registerPlayer>[0] = {
        batchId,
        name: p.name,
        rosterId: p.rosterId,
      }
      if (p.route) reg.pinnedRoute = p.route
      const {player, session} = await engine.registerPlayer(reg)
      const route = await store.getRoute(player.id)
      players.push({
        playerId: player.id,
        name: player.name,
        rosterId: player.rosterId,
        sessionToken: player.sessionToken,
        stops: route?.stops ?? [],
        status: session.status,
        currentLevel: session.currentLevel,
        scoreMs: session.scoreMs,
      })
    }
    return c.json({players})
  })

  /**
   * Put one player back to the start line — organiser only.
   *
   * The remedy for a dead phone, a player who quit and came back, or a run
   * that needs doing again. They keep their account and their sign-in; they
   * get a new route and a clock that has not started.
   */
  app.post('/admin/batches/:id/players/:playerId/reset', async (c) => {
    requireAdmin(c.env, c.req.header('X-Admin-Key'))
    const session = await engineFor(c.env).resetPlayer(
      c.req.param('id'),
      c.req.param('playerId'),
    )
    return c.json({session})
  })

  /**
   * The reporting view for one cohort.
   *
   * Admin-gated, like everything else that reads a whole batch: it describes
   * every player's behaviour — where they got stuck, who gave up and where —
   * which is nobody's business but the organisers'.
   *
   * The aggregation is `computeAnalytics` in @cmh/shared, tested there against
   * a known cohort. This route only fetches the rows and hands them over, so
   * the figures cannot drift between what is tested and what is served.
   */
  app.get('/admin/batches/:id/analytics', async (c) => {
    requireAdmin(c.env, c.req.header('X-Admin-Key'))
    const store = makeStore(c.env)
    const batchId = c.req.param('id')
    // A report for a batch that no longer exists is a 404, not an empty one:
    // every figure would read zero and look like a cohort that did nothing.
    if (!(await store.getBatch(batchId))) return c.json({error: 'batch_not_found'}, 404)
    const [players, sessions, routes, splits, events] = await Promise.all([
      store.listPlayers(batchId),
      store.listSessions(batchId),
      store.listRoutes(batchId),
      store.listBatchSplits(batchId),
      store.listEvents(batchId, ANALYTICS_EVENT_LIMIT),
    ])
    return c.json(
      computeAnalytics({players, sessions, routes, splits, events, nowMs: Date.now()}),
    )
  })

  /**
   * Practice run — no admin key. Creates a throwaway demo batch and one player
   * in a single call. `isDemo` keeps it out of every real batch's standings, so
   * this cannot be used to pollute a live event.
   */
  app.post('/demo/session', async (c) => {
    const engine = engineFor(c.env)
    const store = makeStore(c.env)
    const body = parseDemoSession(await c.req.json().catch(() => ({})))
    const batch = await engine.createBatch({
      name: `Practice ${new Date().toISOString().slice(0, 16)}`,
      isDemo: true,
    })
    const reg: Parameters<typeof engine.registerPlayer>[0] = {
      batchId: batch.id,
      name: 'Practice player',
      rosterId: `demo-${crypto.randomUUID().slice(0, 8)}`,
    }
    if (body.route) reg.pinnedRoute = body.route
    const {player} = await engine.registerPlayer(reg)
    const route = await store.getRoute(player.id)
    return c.json({
      batchId: batch.id,
      sessionToken: player.sessionToken,
      name: player.name,
      stops: route?.stops ?? [],
    })
  })

  /** Shut a batch down — stops signups and closes out any hunt still running. */
  /**
   * Bulk-remove practice batches. Declared before the `:id` delete so the
   * literal path wins the match.
   */
  app.delete('/admin/batches/demo', async (c) => {
    requireAdmin(c.env, c.req.header('X-Admin-Key'))
    return c.json(await engineFor(c.env).deleteDemoBatches())
  })

  /** Remove one batch and everything recorded against it. Irreversible. */
  app.delete('/admin/batches/:id', async (c) => {
    requireAdmin(c.env, c.req.header('X-Admin-Key'))
    return c.json(await engineFor(c.env).deleteBatch(c.req.param('id')))
  })

  app.post('/admin/batches/:id/close', async (c) => {
    requireAdmin(c.env, c.req.header('X-Admin-Key'))
    return c.json(await engineFor(c.env).closeBatch(c.req.param('id')))
  })

  /**
   * What a signup link points at. Public and deliberately thin: it exists so the
   * sign-in screen can say "Induction 2026" rather than leaving the player to
   * guess whether they have the right link. Names an event, counts nobody.
   */
  app.get('/event/:code', async (c) => {
    const batch = await makeStore(c.env).getBatchByCode(c.req.param('code'))
    if (!batch) return c.json({error: 'batch_not_found'}, 404)
    return c.json({name: batch.name, status: batch.status, isDemo: batch.isDemo})
  })

  /**
   * Self-serve signup. Open — the batch's event code is the only gate. Returns
   * the same shape the magic-link bootstrap does, so the client path after this
   * is identical.
   */
  app.post('/session/signup', async (c) => {
    const engine = engineFor(c.env)
    const store = makeStore(c.env)
    const {player} = await engine.signup(parseSignup(await c.req.json()))
    const route = await store.getRoute(player.id)
    return c.json({
      batchId: player.batchId,
      sessionToken: player.sessionToken,
      name: player.name,
      stops: route?.stops ?? [],
    })
  })

  /** Return visit: roll number + password back for the session token. */
  app.post('/session/login', async (c) => {
    const {player} = await engineFor(c.env).login(parseLogin(await c.req.json()))
    return c.json({
      batchId: player.batchId,
      sessionToken: player.sessionToken,
      name: player.name,
    })
  })

  app.post('/session/start', async (c) =>
    c.json(await engineFor(c.env).startHunt(bearer(c.req.header('Authorization')))),
  )

  app.get('/session', async (c) =>
    c.json(await engineFor(c.env).getState(bearer(c.req.header('Authorization')))),
  )

  /** Stop the clock. Everything that mutates a hunt refuses a paused session. */
  app.post('/session/pause', async (c) =>
    c.json({session: await engineFor(c.env).pause(bearer(c.req.header('Authorization')))}),
  )

  /** Restart it, banking the time away. */
  app.post('/session/resume', async (c) =>
    c.json({session: await engineFor(c.env).resume(bearer(c.req.header('Authorization')))}),
  )

  /** Give up for good, scored on what was actually reached. */
  app.post('/session/abandon', async (c) =>
    c.json({session: await engineFor(c.env).abandon(bearer(c.req.header('Authorization')))}),
  )

  /** Start over after an ended hunt, keeping the same account and sign-in. */
  app.post('/session/replay', async (c) =>
    c.json({session: await engineFor(c.env).replay(bearer(c.req.header('Authorization')))}),
  )

  app.post('/session/nearby', async (c) => {
    const token = bearer(c.req.header('Authorization'))
    const samples = parseSamples(await c.req.json())
    return c.json(await engineFor(c.env).nearby(token, samples))
  })

  app.post('/session/arrive', async (c) => {
    const token = bearer(c.req.header('Authorization'))
    const samples = parseSamples(await c.req.json())
    return c.json(await engineFor(c.env).arrive(token, samples))
  })

  /** The player watched the scene. Past the free allowance this costs time. */
  app.post('/session/view', async (c) =>
    c.json(await engineFor(c.env).viewScene(bearer(c.req.header('Authorization')))),
  )

  app.post('/session/hint', async (c) => {
    const token = bearer(c.req.header('Authorization'))
    const rung = parseHintRung(await c.req.json())
    return c.json(await engineFor(c.env).useHint(token, rung))
  })

  app.post('/session/breadcrumbs', async (c) => {
    const token = bearer(c.req.header('Authorization'))
    const {crumbs} = parseCrumbs(await c.req.json())
    await engineFor(c.env).addBreadcrumbs(token, crumbs)
    return c.body(null, 204)
  })

  /** The post-game survey. */
  app.post('/session/feedback', async (c) => {
    const token = bearer(c.req.header('Authorization'))
    await engineFor(c.env).submitFeedback(token, parseFeedback(await c.req.json()))
    return c.body(null, 204)
  })

  /**
   * Run work after the response has gone out, where the runtime offers that.
   * Reading `executionCtx` throws when there is none — tests drive the app as a
   * plain fetch handler — and a cache refresh must never fail a request.
   */
  const detach = (c: {executionCtx: {waitUntil(p: Promise<unknown>): void}}, work: Promise<void>): void => {
    try {
      c.executionCtx.waitUntil(work)
    } catch {
      void work
    }
  }

  /** The board. Served from a short shared cache — see ./standings-cache. */
  app.get('/standings/:batchId', async (c) => {
    const batchId = c.req.param('batchId')
    const token = c.req.header('Authorization')?.match(/^Bearer\s+(.+)$/i)?.[1]
    const selfId = token ? (await makeStore(c.env).getPlayerByToken(token))?.id : undefined

    const cached = await readCached(batchId)
    const entries = cached ?? (await engineFor(c.env).standings(batchId))
    if (!cached) detach(c, writeCached(batchId, entries))

    // playerId is the marking key and stops here; clients see names only.
    return c.json({
      rows: entries.map(({playerId, ...r}) => ({...r, isSelf: playerId === selfId})),
    })
  })

  app.onError((err, c) => {
    if (err instanceof BadInput) return c.json({error: 'bad_input', message: err.message}, 400)
    if (err instanceof EngineError) {
      const status =
        err.code === 'bad_token' || err.code === 'bad_password'
          ? 401
          : err.code === 'batch_not_found' || err.code === 'player_not_found'
            ? 404
            : 409
      return c.json({error: err.code, message: err.message}, status)
    }
    if (err instanceof HTTPException) return err.getResponse()
    console.error(err)
    return c.json({error: 'internal'}, 500)
  })

  app.notFound((c) => c.json({error: 'not_found'}, 404))
  return app
}
