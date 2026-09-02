/**
 * Are the scene files actually there?
 *
 * This exists because of a specific trap. Cloudflare Pages serves the SPA shell
 * for any unmatched path, so a missing clip comes back as `200 OK` with
 * `text/html` — every status-code check calls it healthy, and the failure only
 * shows up as a player standing in the right place being told the footage is
 * unavailable. So this checks the content type, not the status.
 *
 *   npm run clips              # against the local build
 *   npm run clips -- <origin>  # against a deployment
 */

import {LOCATIONS} from '../shared/src/content'

const origin = process.argv[2] ?? 'http://localhost:5173'

interface Check {
  url: string
  ok: boolean
  detail: string
}

/** A HEAD is enough, and a one-byte range keeps it cheap where HEAD is refused. */
async function probe(url: string, wanted: string): Promise<Check> {
  try {
    const res = await fetch(url, {headers: {range: 'bytes=0-1'}})
    const ct = (res.headers.get('content-type') ?? '').split(';')[0]!.trim()
    if (!res.ok) return {url, ok: false, detail: `HTTP ${res.status}`}
    if (!ct.startsWith(wanted)) {
      return {url, ok: false, detail: `served ${ct || 'nothing'} — file is missing`}
    }
    return {url, ok: true, detail: ct}
  } catch (err) {
    return {url, ok: false, detail: err instanceof Error ? err.message : 'unreachable'}
  }
}

const checks = await Promise.all(
  LOCATIONS.flatMap((l) => [
    probe(new URL(l.clipUrl, origin).href, 'video/'),
    probe(new URL(l.posterUrl, origin).href, 'image/'),
  ]),
)

const bad = checks.filter((c) => !c.ok)
for (const c of checks) {
  console.log(`${c.ok ? 'ok  ' : 'MISS'}  ${new URL(c.url).pathname.padEnd(34)} ${c.detail}`)
}
console.log(`\n${checks.length - bad.length}/${checks.length} present at ${origin}`)
if (bad.length > 0) process.exit(1)
