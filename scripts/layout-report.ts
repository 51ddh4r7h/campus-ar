/**
 * Layout report — run this whenever the campus coordinates change.
 *
 * Prints the pairwise spacing, the geofence each stop can safely carry, and the
 * thresholds the engine derives from them. Exits non-zero if the layout is not
 * playable, so a bad survey is caught here rather than on event day.
 *
 *   npm run layout
 */

import {LAYOUT, LOCATIONS, haversineM, ABSOLUTE_MIN_SPACING_M} from '../shared/src/index'

const pad = (s: string, n: number): string => s.padEnd(n)
const m = (n: number): string => `${n.toFixed(0)}m`

console.log('\nCAMPUS LAYOUT\n' + '='.repeat(64))

// --- closest neighbour per stop -------------------------------------------
console.log('\nStop                     nearest neighbour        fence')
console.log('-'.repeat(64))
const pairs: Array<{a: string; b: string; d: number}> = []
for (const a of LOCATIONS) {
  let best = {name: '', d: Infinity}
  for (const b of LOCATIONS) {
    if (a.id === b.id) continue
    const d = haversineM(a, b)
    if (d < best.d) best = {name: b.name, d}
    if (a.id < b.id) pairs.push({a: a.name, b: b.name, d})
  }
  const tight = best.d < ABSOLUTE_MIN_SPACING_M ? '  << TOO CLOSE' : ''
  console.log(`${pad(a.name, 24)} ${pad(`${m(best.d)} → ${best.name}`, 24)} ${m(a.radiusM)}${tight}`)
}

// --- the five closest pairs, which are what set every threshold ------------
console.log('\nTightest pairs')
console.log('-'.repeat(64))
for (const p of pairs.sort((x, y) => x.d - y.d).slice(0, 5)) {
  console.log(`  ${m(p.d).padStart(6)}   ${p.a} ↔ ${p.b}`)
}

// --- what the engine derives from all that --------------------------------
console.log('\nDerived thresholds')
console.log('-'.repeat(64))
console.log(`  closest pair anywhere     ${m(LAYOUT.minSpacingM)}`)
console.log(`  reject fixes worse than   ${m(LAYOUT.maxAccuracyM)}`)
console.log(`  heat meter live within    ${m(LAYOUT.heatRangeM)}`)
console.log(`  fastest allowed leg       ${(LAYOUT.minLegMs / 1000).toFixed(0)}s`)
console.log(`  geofences                 ${m(Math.min(...LOCATIONS.map((l) => l.radiusM)))}–${m(
  Math.max(...LOCATIONS.map((l) => l.radiusM)),
)}`)

if (LAYOUT.warnings.length > 0) {
  console.log('\nPROBLEMS')
  console.log('-'.repeat(64))
  for (const w of LAYOUT.warnings) console.log(`  • ${w}`)
  console.log('')
  process.exit(1)
}
console.log('\nLayout is playable.\n')
