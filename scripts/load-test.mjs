/**
 * Concurrency check: can the Worker carry a whole cohort at once?
 *
 * Simulates players doing what players actually do — polling "am I there yet?"
 * on the real cadence, uploading breadcrumbs, opening the board — and reports
 * latency percentiles and errors per endpoint.
 *
 * It ramps rather than jumping straight to the target, because the number that
 * matters is not p95 at 150; it is whether p95 at 150 looks like p95 at 10.
 * Flat means the work per request is constant and the thing scales. A curve
 * means something is quadratic and no amount of hardware will save it on the
 * day.
 *
 *   node scripts/load-test.mjs                     # 10/50/100/150 vs localhost
 *   node scripts/load-test.mjs --players 150       # one stage
 *   node scripts/load-test.mjs --seconds 60
 *
 * Points at localhost by default and REFUSES any other host without
 * --i-know-this-writes-real-data, because a load test against production
 * leaves a few thousand rows and a batch full of imaginary people.
 */

import {readFileSync} from 'node:fs'

const args = process.argv.slice(2)
const flag = (name, fallback) => {
  const i = args.indexOf(`--${name}`)
  return i === -1 ? fallback : args[i + 1]
}
const has = (name) => args.includes(`--${name}`)

const BASE = flag('base', 'http://localhost:8787')
const SECONDS = Number(flag('seconds', 30))
const STAGES = flag('players') ? [Number(flag('players'))] : [10, 50, 100, 150]

if (!/^https?:\/\/localhost|^https?:\/\/127\./.test(BASE) && !has('i-know-this-writes-real-data')) {
  console.error(
    `Refusing to load-test ${BASE}.\n` +
      'This creates a batch, hundreds of players and thousands of rows.\n' +
      'Against production that is real data in the real database.\n' +
      'Add --i-know-this-writes-real-data if you truly mean it.',
  )
  process.exit(1)
}

const ADMIN_KEY = (() => {
  try {
    return readFileSync('worker/.dev.vars', 'utf8').match(/^ADMIN_KEY *= *"?([^"\n]+)"?/m)[1]
  } catch {
    console.error('No worker/.dev.vars — cannot read ADMIN_KEY.')
    process.exit(1)
  }
})()

// ---------------------------------------------------------------- plumbing

/** Every sample the run produced, by endpoint. */
const samples = new Map()

async function timed(label, path, init) {
  const started = performance.now()
  let status = 0
  try {
    const res = await fetch(BASE + path, init)
    status = res.status
    await res.arrayBuffer()
  } catch {
    status = 0
  }
  const ms = performance.now() - started
  const bucket = samples.get(label) ?? {ms: [], ok: 0, bad: 0}
  bucket.ms.push(ms)
  if (status >= 200 && status < 400) bucket.ok++
  else bucket.bad++
  samples.set(label, bucket)
  return status
}

const pct = (sorted, p) => sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))]

const admin = () => ({'X-Admin-Key': ADMIN_KEY, 'content-type': 'application/json'})
const auth = (t) => ({Authorization: `Bearer ${t}`, 'content-type': 'application/json'})
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

// A fixed point near campus. Arrivals are not what we are measuring; the
// read path is, and it costs the same wherever the player is standing.
const HERE = {lat: 18.5372, lng: 73.7318}
const crumbs = (n) =>
  Array.from({length: n}, (_, i) => ({
    lat: HERE.lat + i * 1e-5,
    lng: HERE.lng,
    accuracyM: 6,
    tsMs: Date.now() - i * 5000,
  }))
const geoSamples = () =>
  Array.from({length: 6}, (_, i) => ({
    lat: HERE.lat,
    lng: HERE.lng,
    accuracyM: 6,
    tsMs: Date.now() - i * 3000,
    simulated: true,
  }))

// ------------------------------------------------------------------ a stage

async function stage(players) {
  samples.clear()
  const code = `load${Math.floor(Math.random() * 1e6)}`
  const batch = await (
    await fetch(`${BASE}/admin/batches`, {
      method: 'POST',
      headers: admin(),
      body: JSON.stringify({name: `Load ${players}`, eventCode: code}),
    })
  ).json()

  process.stdout.write(`  seating ${players}… `)
  const tokens = []
  // Sign up in waves so setup itself does not look like the load test.
  for (let i = 0; i < players; i += 25) {
    const wave = await Promise.all(
      Array.from({length: Math.min(25, players - i)}, (_, k) =>
        fetch(`${BASE}/session/signup`, {
          method: 'POST',
          headers: {'content-type': 'application/json'},
          body: JSON.stringify({
            eventCode: code,
            username: `p${i + k}`,
            name: `Player ${i + k}`,
            password: 'loadtest123',
          }),
        }).then((r) => r.json()),
      ),
    )
    tokens.push(...wave.map((w) => w.sessionToken).filter(Boolean))
  }
  await Promise.all(
    tokens.map((t) => fetch(`${BASE}/session/start`, {method: 'POST', headers: auth(t)})),
  )
  process.stdout.write(`${tokens.length} playing\n`)

  const until = Date.now() + SECONDS * 1000
  const runners = tokens.map(async (token, i) => {
    // Stagger, so a cohort that all pressed START together does not poll in
    // lockstep for the rest of the event.
    await sleep((i / tokens.length) * 5000)
    let tick = 0
    while (Date.now() < until) {
      tick++
      await timed('nearby', '/session/nearby', {
        method: 'POST',
        headers: auth(token),
        body: JSON.stringify({samples: geoSamples()}),
      })
      // Breadcrumbs every third poll ~ the real 15s flush.
      if (tick % 3 === 0) {
        await timed('breadcrumbs', '/session/breadcrumbs', {
          method: 'POST',
          headers: auth(token),
          body: JSON.stringify({crumbs: crumbs(3)}),
        })
      }
      // A tenth of the cohort has the board open at any moment.
      if (i % 10 === 0 && tick % 2 === 0) {
        await timed('standings', `/standings/${batch.id}`, {headers: auth(token)})
      }
      await sleep(5000)
    }
  })

  const wall = performance.now()
  await Promise.all(runners)
  const elapsed = (performance.now() - wall) / 1000

  const rows = [...samples.entries()].map(([label, b]) => {
    const sorted = b.ms.sort((x, y) => x - y)
    return {
      label,
      calls: sorted.length,
      rps: +(sorted.length / elapsed).toFixed(1),
      p50: Math.round(pct(sorted, 50)),
      p95: Math.round(pct(sorted, 95)),
      p99: Math.round(pct(sorted, 99)),
      max: Math.round(sorted[sorted.length - 1]),
      errors: b.bad,
    }
  })
  return {players, batchId: batch.id, code, rows, elapsed}
}

// -------------------------------------------------------------------- main

console.log(`Load test → ${BASE}`)
console.log(`Stages: ${STAGES.join(', ')} players · ${SECONDS}s each\n`)

const created = []
for (const n of STAGES) {
  console.log(`── ${n} players ──`)
  const out = await stage(n)
  created.push(out.batchId)
  console.table(out.rows)
  console.log()
}

console.log('Batches created (delete them from ?admin, or with the API):')
created.forEach((id) => console.log('  ' + id))
