/**
 * Simulated hunt — plays a full scored game end to end against the in-memory
 * store, with a virtual clock and synthesized GPS. No server, no network.
 *
 *   npm run sim
 *
 * Prints each player's route, splits, hint penalties, final score-vs-par, and
 * the batch standings. Use it to sanity-check engine changes.
 */

import {
  VALIDATION,
  createEngine,
  formatClock,
  locationById,
  type EngineDeps,
  type GeoSample,
} from '@cmh/shared'
import {InMemoryStore} from '@cmh/shared'

class Clock implements EngineDeps {
  t = Date.parse('2026-09-01T09:00:00Z')
  private n = 0
  now() {
    return this.t
  }
  randomId() {
    return `id-${(++this.n).toString(36)}-${Math.random().toString(36).slice(2, 6)}`
  }
  randomToken() {
    return `tok-${Math.random().toString(36).slice(2)}`
  }
  async hashPassword(pw: string) {
    return `h:${pw}`
  }
  async verifyPassword(pw: string, stored: string) {
    return stored === `h:${pw}`
  }
  advance(ms: number) {
    this.t += ms
  }
}

const parkedAt = (
  point: {lat: number; lng: number},
  endTsMs: number,
): GeoSample[] => {
  const out: GeoSample[] = []
  for (let t = endTsMs; t >= endTsMs - (VALIDATION.dwellMs + 6_000); t -= 3_000) {
    out.push({lat: point.lat, lng: point.lng, accuracyM: 0, tsMs: t, simulated: true})
  }
  return out
}

interface Persona {
  name: string
  rosterId: string
  legMs: number
  hintOnLevel1?: boolean
}

async function play(
  engine: ReturnType<typeof createEngine>,
  store: InMemoryStore,
  clock: Clock,
  token: string,
  persona: Persona,
): Promise<void> {
  const player = (await store.getPlayerByToken(token))!
  const route = (await store.getRoute(player.id))!
  const {clue} = await engine.startHunt(token)

  console.log(`\n▶ ${persona.name}  ·  route: ${route.stops.join(' → ')}`)
  console.log(`  par ${formatClock(route.parTotalMs)}  (legs ${route.legParMs.map(formatClock).join(' / ')})`)

  let level = clue.level
  while (level <= 5) {
    if (level === 1 && persona.hintOnLevel1) {
      clock.advance(VALIDATION.dwellMs + 5 * 60_000)
      const h = await engine.useHint(token, 'warm')
      console.log(`  L1 hint: "${h.clue.clueText.warm}"  (+${formatClock(h.penaltyMs)})`)
    }
    const loc = locationById(route.stops[level - 1]!)!
    clock.advance(persona.legMs)
    const res = await engine.arrive(token, parkedAt(loc, clock.now()))
    if (!res.ok) {
      console.log(`  L${level} ✗ ${res.failure}`)
      return
    }
    console.log(
      `  L${level} ✓ ${loc.name.padEnd(18)} split ${formatClock(res.split!.splitMs)}` +
        (res.split!.penaltyMs ? `  (penalty +${formatClock(res.split!.penaltyMs)})` : ''),
    )
    if (res.session.status === 'complete') {
      const s = res.session
      const sign = (s.scoreMs ?? 0) <= 0 ? 'under' : 'over'
      console.log(
        `  ⏹ complete  ·  total ${formatClock(s.endTsMs! - s.startTsMs!)}  ·  ` +
          `${sign} par by ${formatClock(Math.abs(s.scoreMs ?? 0))}`,
      )
      return
    }
    level = res.nextClue!.level
  }
}

async function main(): Promise<void> {
  const store = new InMemoryStore()
  const clock = new Clock()
  const engine = createEngine(store, clock)

  const batch = await engine.createBatch({name: 'Induction — Batch 1'})
  console.log(`Batch ${batch.name}`)
  console.log(
    `Route pool: ${batch.pool.routes.length} routes, ` +
      `par spread ${formatClock(batch.pool.stats.walkSpreadMs)}, ` +
      `difficulty sums ${batch.pool.stats.difficultySums.join('/')}` +
      (batch.pool.relaxed ? '  (RELAXED)' : ''),
  )

  const personas: Persona[] = [
    {name: 'Priya S.', rosterId: 'S-101', legMs: 3.2 * 60_000},
    {name: 'Luca M.', rosterId: 'S-102', legMs: 3.8 * 60_000},
    {name: 'Maya R.', rosterId: 'S-103', legMs: 4.5 * 60_000, hintOnLevel1: true},
    {name: 'Iris C.', rosterId: 'S-104', legMs: 6.0 * 60_000},
  ]

  for (const p of personas) {
    const {player} = await engine.registerPlayer({
      batchId: batch.id,
      name: p.name,
      rosterId: p.rosterId,
    })
    clock.advance(30_000) // staggered starts
    // Iris is still mid-hunt at report time: stop her after level 3.
    if (p.name === 'Iris C.') {
      await engine.startHunt(player.sessionToken)
      const route = (await store.getRoute(player.id))!
      for (let lvl = 1; lvl <= 3; lvl++) {
        clock.advance(p.legMs)
        await engine.arrive(
          player.sessionToken,
          parkedAt(locationById(route.stops[lvl - 1]!)!, clock.now()),
        )
      }
      console.log(`\n▶ ${p.name}  ·  still on the course (reached level 3)`)
      continue
    }
    await play(engine, store, clock, player.sessionToken, p)
  }

  console.log('\n── Standings ──')
  const rows = await engine.standings(batch.id)
  for (const r of rows) {
    const status =
      r.scoreMs === null
        ? `Level ${r.level}`
        : `${r.scoreMs <= 0 ? '−' : '+'}${formatClock(Math.abs(r.scoreMs))}`
    console.log(`  ${r.rank}. ${r.playerName.padEnd(12)} ${status}`)
  }
}

main().catch((err: unknown) => {
  console.error(err)
  process.exit(1)
})
