import {Hono} from 'hono'
import {cors} from 'hono/cors'
import {LEVEL_COUNT, LOCATION_POOL_SIZE} from '@cmh/shared'
import type {Env} from './env'

export {StandingsRoom} from './standings-room'

const app = new Hono<{Bindings: Env}>()

app.use('/*', cors())

app.get('/health', (c) =>
  c.json({
    ok: true,
    service: 'campus-movie-hunt-api',
    levels: LEVEL_COUNT,
    locationPool: LOCATION_POOL_SIZE,
  }),
)

// Phase 1 mounts: /session, /validate, /hint, /standings, /breadcrumbs, /admin/*

app.notFound((c) => c.json({error: 'not_found'}, 404))

export default app
