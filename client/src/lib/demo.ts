/**
 * Demo bootstrap. Spins up a throwaway batch + player so the whole flow can be
 * walked with a simulated GPS feed — for testing and for players who can't use
 * real location. Real events pre-register players out of band and never hit
 * this path.
 */

import {api} from './api'
import {game} from './stores/game.svelte'

/** Real surveyed film locations, the amphitheatre (the biggest set-piece) first. */
const DEMO_ROUTE = ['amphitheatre', 'symbieat', 'sibm', 'library', 'fountain']

export async function startDemo(): Promise<void> {
  const s = await api.demoSession(DEMO_ROUTE)
  game.setCredentials(s.sessionToken, s.batchId, s.name, {demo: true, demoStops: s.stops})
}
