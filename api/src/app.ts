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
import type {ApiEnv} from './env'
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

export const createApp = (store: GameStore, env: ApiEnv) => {
  const engine = createEngine(store, deps)
  const app = new Hono()

  app.use('/*', cors())

  app.get('/health', (c) =>
    c.json({ok: true, service: 'campus-movie-hunt-api', levels: LEVEL_COUNT, locationPool: LOCATION_POOL_SIZE}),
  )

  const requireAdmin = (key: string | undefined): void => {
    if (env.adminKey && key !== env.adminKey) {
      throw new HTTPException(403, {message: 'bad admin key'})
    }
  }

  app.post('/admin/batches', async (c) => {
    requireAdmin(c.req.header('X-Admin-Key'))
    const body = parseCreateBatch(await c.req.json())
    const batch = await engine.createBatch({name: body.name})
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
    requireAdmin(c.req.header('X-Admin-Key'))
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
    c.json(await engine.startHunt(bearer(c.req.header('Authorization')))),
  )

  app.get('/session', async (c) =>
    c.json(await engine.getState(bearer(c.req.header('Authorization')))),
  )

  app.post('/session/arrive', async (c) => {
    const token = bearer(c.req.header('Authorization'))
    const samples = parseSamples(await c.req.json())
    return c.json(await engine.arrive(token, samples))
  })

  app.post('/session/hint', async (c) => {
    const token = bearer(c.req.header('Authorization'))
    const rung = parseHintRung(await c.req.json())
    return c.json(await engine.useHint(token, rung))
  })

  app.post('/session/breadcrumbs', async (c) => {
    const token = bearer(c.req.header('Authorization'))
    const {crumbs} = parseCrumbs(await c.req.json())
    await engine.addBreadcrumbs(token, crumbs)
    return c.body(null, 204)
  })

  app.get('/standings/:batchId', async (c) => {
    const token = c.req.header('Authorization')?.match(/^Bearer\s+(.+)$/i)?.[1]
    const selfId = token ? (await store.getPlayerByToken(token))?.id : undefined
    return c.json({rows: await engine.standings(c.req.param('batchId'), selfId)})
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
