import {describe, expect, it} from 'vitest'
import {startDemo, type DemoDeps} from './demo'

/**
 * The practice bootstrap must refuse outside `?demo`.
 *
 * This is the fault that reached a live test twice. `startDemo` replaces the
 * signed-in token with a throwaway practice player's, and the finish screen's
 * "Play again" called it unconditionally — so a real player who finished a
 * hunt on the plain event link was handed a simulated one, GPS and all, and
 * the next levels completed themselves while they stood still.
 *
 * Guarding that one button is not what this pins. Any future caller that
 * forgets the check is, which is why the guard lives in `startDemo` itself.
 */
const SESSION = {
  sessionToken: 'practice-token',
  batchId: 'practice-batch',
  name: 'Guest',
  stops: ['amphitheatre'],
}

/** Records what the real deps would have done to the network and the store. */
function spyDeps(allowed: boolean) {
  const created: string[][] = []
  const adopted: (typeof SESSION)[] = []
  const deps: DemoDeps = {
    allowed,
    create: async (route) => {
      created.push(route)
      return SESSION
    },
    adopt: (s) => void adopted.push(s),
  }
  return {deps, created, adopted}
}

describe('startDemo', () => {
  it('refuses on a link that never asked for practice', async () => {
    const {deps, created, adopted} = spyDeps(false)

    await expect(startDemo(deps)).rejects.toThrow(/only available on \?demo/)

    // No throwaway batch was created, and no session was replaced — so
    // whoever was signed in still is, with their real GPS.
    expect(created).toEqual([])
    expect(adopted).toEqual([])
  })

  it('starts one on ?demo', async () => {
    const {deps, created, adopted} = spyDeps(true)

    await startDemo(deps)

    expect(created).toHaveLength(1)
    expect(created[0]).toContain('amphitheatre')
    expect(adopted).toEqual([SESSION])
  })
})
