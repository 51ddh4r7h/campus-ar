/**
 * Demo bootstrap. Spins up a throwaway batch + player so the whole flow can be
 * walked with a simulated GPS feed — for testing and for players who can't use
 * real location. Real events pre-register players out of band and never hit
 * this path.
 */

import {api} from './api'
import {demoAllowed} from './mode'
import {game} from './stores/game.svelte'

/** Real surveyed film locations, the amphitheatre (the biggest set-piece) first. */
const DEMO_ROUTE = ['amphitheatre', 'symbieat', 'sibm', 'library', 'fountain']

interface PracticeSession {
  sessionToken: string
  batchId: string
  name: string
  stops: string[]
}

/** Injected so the guard below can be tested without a network or a store. */
export interface DemoDeps {
  /** Whether this URL asked for practice at all. */
  allowed: boolean
  create: (route: string[]) => Promise<PracticeSession>
  adopt: (s: PracticeSession) => void
}

const liveDeps = (): DemoDeps => ({
  allowed: demoAllowed,
  create: (route) => api.demoSession(route),
  adopt: (s) =>
    game.setCredentials(s.sessionToken, s.batchId, s.name, {demo: true, demoStops: s.stops}),
})

/**
 * The one door into a simulated hunt, and it is barred outside `?demo`.
 *
 * Guarding the callers was not enough: this replaces whoever is signed in with
 * a throwaway practice player, so a single caller that forgets to check hands
 * a real player a simulated hunt. The finish screen's "Play again" did exactly
 * that. The check belongs here, where it cannot be forgotten again.
 */
export async function startDemo(deps: DemoDeps = liveDeps()): Promise<void> {
  if (!deps.allowed) throw new Error('practice runs are only available on ?demo')
  deps.adopt(await deps.create(DEMO_ROUTE))
}
