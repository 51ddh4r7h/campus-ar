/**
 * Generate and inspect a balanced route pool for a batch seed.
 *
 *   npm run gen:routes -- <seed>
 *
 * Writes scripts/out/<seed>.json and prints a summary an operator can eyeball
 * before opening the batch.
 */

import {mkdirSync, writeFileSync} from 'node:fs'
import {dirname, join} from 'node:path'
import {fileURLToPath} from 'node:url'
import {
  DEFAULT_PAR_CONSTANTS,
  LOCATIONS,
  START_POINT,
  formatClock,
  generateRoutePool,
  locationById,
} from '@cmh/shared'

const seed = process.argv[2] ?? 'batch-1'
const pool = generateRoutePool(LOCATIONS, START_POINT, DEFAULT_PAR_CONSTANTS, seed)

const outDir = join(dirname(fileURLToPath(import.meta.url)), 'out')
mkdirSync(outDir, {recursive: true})
const outFile = join(outDir, `${seed}.json`)
writeFileSync(outFile, JSON.stringify(pool, null, 2))

console.log(`Seed "${seed}" → ${pool.routes.length} routes${pool.relaxed ? '  (RELAXED)' : ''}`)
console.log(`Candidates considered: ${pool.stats.candidates}`)
console.log(`Difficulty sums in pool: ${pool.stats.difficultySums.join(', ')}`)
console.log(`Par spread across pool:  ${formatClock(pool.stats.walkSpreadMs)}`)

const pars = pool.routes.map((r) => r.parTotalMs)
console.log(
  `Par range: ${formatClock(Math.min(...pars))} – ${formatClock(Math.max(...pars))}`,
)

// First-clue distribution — should skew to easy locations and be spread out.
const firstCounts = new Map<string, number>()
for (const r of pool.routes) {
  firstCounts.set(r.stops[0], (firstCounts.get(r.stops[0]) ?? 0) + 1)
}
console.log('\nLevel-1 clue distribution:')
for (const [id, n] of [...firstCounts].sort((a, b) => b[1] - a[1])) {
  const loc = locationById(id)!
  console.log(`  ${loc.name.padEnd(18)} d${loc.difficulty}  ×${n}`)
}

console.log('\nFirst 5 routes:')
for (const r of pool.routes.slice(0, 5)) {
  console.log(`  ${formatClock(r.parTotalMs)}  ${r.stops.join(' → ')}`)
}

console.log(`\nWritten to ${outFile}`)
