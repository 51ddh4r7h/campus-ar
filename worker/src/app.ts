import {Hono} from 'hono'
import {cors} from 'hono/cors'
import {HTTPException} from 'hono/http-exception'
import {
  EngineError,
  LEVEL_COUNT,
  LOCATION_POOL_SIZE,
  createEngine,
  type EngineDeps,
  type GameStore,
} from '@cmh/shared'
import type {Env} from './env'
import {
  BadInput,
  parseCreateBatch,
  parseCrumbs,
  parseHintRung,
  parseRegisterPlayers,
  parseSamples,
} from './guards'

const deps: EngineDeps = {
  now: () => Date.now(),
  randomId: () => crypto.randomUUID(),
  randomToken: () =>
    crypto.randomUUID().replace(/-/g, '') + crypto.randomUUID().replace(/-/g, ''),
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
export const createApp = (makeStore: (env: Env) => GameStore) => {
  const app = new Hono<{Bindings: Env}>()
  app.use('/*', cors())

  const engineFor = (env: Env) => createEngine(makeStore(env), deps)

  const requireAdmin = (env: Env, key: string | undefined): void => {
    if (env.ADMIN_KEY && key !== env.ADMIN_KEY) {
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
    const batch = await engineFor(c.env).createBatch({name: body.name})
    return c.json({
      id: batch.id,
      name: batch.name,
      status: batch.status,
      poolSize: batch.pool.routes.length,
      relaxed: batch.pool.relaxed,
      stats: batch.pool.stats,
    })
  })

  app.post('/admin/batches/:id/players', async (c) => {
    requireAdmin(c.env, c.req.header('X-Admin-Key'))
    const store = makeStore(c.env)
    const engine = engineFor(c.env)
    const body = parseRegisterPlayers(await c.req.json())
    const batchId = c.req.param('id')
    const players = []
    for (const p of body.players) {
      const {player} = await engine.registerPlayer({batchId, name: p.name, rosterId: p.rosterId})
      const route = await store.getRoute(player.id)
      players.push({
        playerId: player.id,
        name: player.name,
        rosterId: player.rosterId,
        sessionToken: player.sessionToken,
        stops: route?.stops ?? [],
      })
    }
    return c.json({players})
  })

  app.post('/session/start', async (c) =>
    c.json(await engineFor(c.env).startHunt(bearer(c.req.header('Authorization')))),
  )

  app.get('/session', async (c) =>
    c.json(await engineFor(c.env).getState(bearer(c.req.header('Authorization')))),
  )

  app.post('/session/arrive', async (c) => {
    const token = bearer(c.req.header('Authorization'))
    const samples = parseSamples(await c.req.json())
    return c.json(await engineFor(c.env).arrive(token, samples))
  })

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

  app.get('/standings/:batchId', async (c) => {
    const token = c.req.header('Authorization')?.match(/^Bearer\s+(.+)$/i)?.[1]
    const selfId = token ? (await makeStore(c.env).getPlayerByToken(token))?.id : undefined
    return c.json({rows: await engineFor(c.env).standings(c.req.param('batchId'), selfId)})
  })

  app.onError((err, c) => {
    if (err instanceof BadInput) return c.json({error: 'bad_input', message: err.message}, 400)
    if (err instanceof EngineError) {
      const status = err.code === 'bad_token' ? 401 : err.code === 'batch_not_found' ? 404 : 409
      return c.json({error: err.code, message: err.message}, status)
    }
    if (err instanceof HTTPException) return err.getResponse()
    console.error(err)
    return c.json({error: 'internal'}, 500)
  })

  app.notFound((c) => c.json({error: 'not_found'}, 404))
  return app
}
