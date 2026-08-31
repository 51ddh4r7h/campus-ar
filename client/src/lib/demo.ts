/**
 * Demo bootstrap. Spins up a throwaway batch + player so the whole flow can be
 * walked with a simulated GPS feed — for testing and for players who can't use
 * real location. Real events pre-register players out of band and never hit
 * this path.
 */

import {api} from './api'
import {game} from './stores/game.svelte'

const suffix = () => Math.random().toString(36).slice(2, 6)

/** Real surveyed campus spots, Mind Studio (with the real S3 clip) first. */
const DEMO_ROUTE = ['mind-studio', 'aqua-point', 'the-fountain', 'central-library', 'auditorium']

export async function startDemo(): Promise<void> {
  const batch = await api.createBatch(`Demo ${new Date().toISOString().slice(0, 16)}`)
  const {players} = await api.registerPlayers(batch.id, [
    {name: 'Demo Player', rosterId: `demo-${suffix()}`, route: DEMO_ROUTE},
  ])
  const p = players[0]
  if (!p) throw new Error('demo: registration returned no player')
  game.setCredentials(p.sessionToken, batch.id, p.name, {demo: true, demoStops: p.stops})
}
