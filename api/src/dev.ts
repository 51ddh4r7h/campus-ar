/**
 * Local dev server. Uses an in-memory store (state lives only for the life of
 * the process) so the client can be built and demoed without any AWS resources.
 *
 *   npm run dev:api   →   http://localhost:8787
 */

import {serve} from '@hono/node-server'
import {InMemoryStore} from '@cmh/shared'
import {createApp} from './app'
import {envFromProcess} from './env'

const app = createApp(new InMemoryStore(), {...envFromProcess(), adminKey: null})

serve({fetch: app.fetch, port: 8787}, (info) => {
  console.log(`campus-movie-hunt api (in-memory) → http://localhost:${info.port}`)
})
