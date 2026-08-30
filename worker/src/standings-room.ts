import type {StandingRow} from '@cmh/shared'
import type {Env} from './env'

/**
 * One Durable Object per batch. Holds the live standings and fans updates out to
 * connected clients over WebSocket. Phase 1 fills in the update path; for now it
 * stores rows and serves a snapshot.
 */
export class StandingsRoom {
  private rows: StandingRow[] = []
  private readonly sockets = new Set<WebSocket>()

  constructor(
    _state: DurableObjectState,
    _env: Env,
  ) {}

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url)

    if (url.pathname === '/ws') {
      const pair = new WebSocketPair()
      const [client, server] = [pair[0], pair[1]]
      server.accept()
      this.sockets.add(server)
      server.send(JSON.stringify({type: 'snapshot', rows: this.rows}))
      server.addEventListener('close', () => this.sockets.delete(server))
      return new Response(null, {status: 101, webSocket: client})
    }

    if (url.pathname === '/rows' && request.method === 'GET') {
      return Response.json(this.rows)
    }

    if (url.pathname === '/rows' && request.method === 'PUT') {
      // SAFETY: the only caller is the Worker's own standings recompute, which
      // serialises StandingRow[]. Phase 1 adds a schema check at this boundary.
      this.rows = (await request.json()) as StandingRow[]
      const msg = JSON.stringify({type: 'snapshot', rows: this.rows})
      for (const s of this.sockets) {
        try {
          s.send(msg)
        } catch {
          this.sockets.delete(s)
        }
      }
      return new Response(null, {status: 204})
    }

    return new Response('not found', {status: 404})
  }
}
