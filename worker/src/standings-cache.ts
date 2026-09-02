/**
 * A short shared cache for the board.
 *
 * The standings read is the only one whose cost scales with the size of the
 * cohort rather than with one player: it walks every player and every session
 * in the batch. Everyone in that batch asks the same question and gets the same
 * answer bar which row is theirs, so it is computed once, held impersonally for
 * a few seconds, and marked per request on the way out. With 200 players opening
 * the board at once that is one pair of table scans instead of two hundred.
 *
 * The window is deliberately shorter than the client's poll interval, so a
 * board can never appear more than one tick behind.
 */

import type {StandingEntry} from '@cmh/shared'

const TTL_S = 10

/**
 * The Workers cache, or null when there isn't one — tests and local tooling run
 * outside the runtime. Resolved once here so callers get a value with a
 * contract rather than a capability check at every use.
 */
const edgeCache: Cache | null = 'caches' in globalThis ? caches.default : null

const keyFor = (batchId: string): Request =>
  new Request(`https://standings.internal/${encodeURIComponent(batchId)}`)

/**
 * The cached board for a batch, or null on a miss. Never throws: a cache that
 * is unavailable or corrupt is a miss, not an error.
 */
export async function readCached(batchId: string): Promise<StandingEntry[] | null> {
  if (!edgeCache) return null
  try {
    const hit = await edgeCache.match(keyFor(batchId))
    if (!hit) return null
    // SAFETY: this key is only ever written by `writeCached` below, which
    // serialises exactly this shape. Anything else is treated as a miss.
    const rows = (await hit.json()) as StandingEntry[]
    return Array.isArray(rows) ? rows : null
  } catch {
    return null
  }
}

/**
 * Store a freshly computed board. Returns the promise so the caller can hand it
 * to `waitUntil` and keep it off the response path.
 */
export function writeCached(batchId: string, entries: readonly StandingEntry[]): Promise<void> {
  if (!edgeCache) return Promise.resolve()
  return edgeCache
    .put(
      keyFor(batchId),
      new Response(JSON.stringify(entries), {
        headers: {'content-type': 'application/json', 'cache-control': `max-age=${TTL_S}`},
      }),
    )
    .catch(() => {})
}
