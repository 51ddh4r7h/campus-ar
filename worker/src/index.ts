import {Hono} from 'hono'
import {cors} from 'hono/cors'
import {HTTPException} from 'hono/http-exception'
import {
  LEVEL_COUNT,
  LOCATION_POOL_SIZE,
  createEngine,
  type EngineDeps,
  type GameEngine,
} from '@cmh/shared'
import {EngineError} from '@cmh/shared'
import type {Env} from './env'
import {D1Store} from './d1-store'
import {
  BadInput,
  parseCreateBatch,
  parseCrumbs,
  parseHintRung,
  parseRegisterPlayers,
  parseSamples,
} from './guards'

export {StandingsRoom} from './standings-room'

const deps: EngineDeps = {
  now: () => Date.now(),
  randomId: () => crypto.randomUUID(),
  randomToken: () => crypto.randomUUID().replace(/-/g, '') + crypto.randomUUID().replace(/-/g, ''),
}

const engineFor = (env: Env): GameEngine => createEngine(new D1Store(env.DB), deps)

const bearer = (auth: string | undefined): string => {
  const token = auth?.match(/^Bearer\s+(.+)$/i)?.[1]
  if (!token) throw new HTTPException(401, {message: 'missing bearer token'})
  return token
}

/** Recompute standings from D1 and hand them to the batch's Durable Object. */
async function pushStandings(env: Env, engine: GameEngine, batchId: string): Promise<void> {
  const rows = await engine.standings(batchId)
  const stub = env.STANDINGS.get(env.STANDINGS.idFromName(batchId))
  await stub.fetch('https://standings/rows', {
    method: 'PUT',
    body: JSON.stringify(rows),
  })
}

const app = new Hono<{Bindings: Env}>()
app.use('/*', cors())

app.get('/health', (c) =>
  c.json({ok: true, service: 'campus-movie-hunt-api', levels: LEVEL_COUNT, locationPool: LOCATION_POOL_SIZE}),
)

// ---------------------------------------------------------------- admin

const requireAdmin = (c: {req: {header: (k: string) => string | undefined}; env: Env}): void => {
  if (c.env.ADMIN_KEY && c.req.header('X-Admin-Key') !== c.env.ADMIN_KEY) {
    throw new HTTPException(403, {message: 'bad admin key'})
  }
}

app.post('/admin/batches', async (c) => {
  requireAdmin(c)
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
  requireAdmin(c)
  const engine = engineFor(c.env)
  const body = parseRegisterPlayers(await c.req.json())
  const batchId = c.req.param('id')
  const out = []
  for (const p of body.players) {
    const {player} = await engine.registerPlayer({batchId, name: p.name, rosterId: p.rosterId})
    const route = await new D1Store(c.env.DB).getRoute(player.id)
    out.push({
      playerId: player.id,
      name: player.name,
      rosterId: player.rosterId,
      sessionToken: player.sessionToken,
      stops: route?.stops ?? [],
    })
  }
  return c.json({players: out})
})

// ---------------------------------------------------------------- session

app.post('/session/start', async (c) => {
  const token = bearer(c.req.header('Authorization'))
  return c.json(await engineFor(c.env).startHunt(token))
})

app.get('/session', async (c) => {
  const token = bearer(c.req.header('Authorization'))
  return c.json(await engineFor(c.env).getState(token))
})

app.post('/session/arrive', async (c) => {
  const token = bearer(c.req.header('Authorization'))
  const engine = engineFor(c.env)
  const samples = parseSamples(await c.req.json())
  const result = await engine.arrive(token, samples)

  if (result.ok || result.session.status === 'complete') {
    const player = await new D1Store(c.env.DB).getPlayerByToken(token)
    if (player) c.executionCtx.waitUntil(pushStandings(c.env, engine, player.batchId))
  }
  return c.json(result)
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

// ---------------------------------------------------------------- standings

app.get('/standings/:batchId', async (c) => {
  const token = c.req.header('Authorization')?.match(/^Bearer\s+(.+)$/i)?.[1]
  let selfId: string | undefined
  if (token) selfId = (await new D1Store(c.env.DB).getPlayerByToken(token))?.id
  const rows = await engineFor(c.env).standings(c.req.param('batchId'), selfId)
  return c.json({rows})
})

app.get('/standings/:batchId/live', (c) => {
  const stub = c.env.STANDINGS.get(c.env.STANDINGS.idFromName(c.req.param('batchId')))
  return stub.fetch('https://standings/ws', c.req.raw)
})

// ---------------------------------------------------------------- errors

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

export default app
