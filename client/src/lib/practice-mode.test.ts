import {describe, expect, it} from 'vitest'

/**
 * Who may be handed a simulated GPS feed.
 *
 * A real session must never be: the simulator walks between stops on a timer,
 * so a scored hunt would complete itself while its player stood still. A field
 * test finished two levels from a classroom this way, one tap from the location
 * prompt, on an account in a real batch.
 *
 * This mirrors `canPractise` on the permissions screen. It is a rule about who
 * is asking, not about what the app can do, so it is worth pinning separately
 * from the component that enforces it.
 */
const canPractise = (opts: {demoAllowed: boolean; hasToken: boolean}): boolean =>
  opts.demoAllowed && !opts.hasToken

describe('practice mode eligibility', () => {
  it('refuses a signed-in player, even when the URL asks for it', () => {
    expect(canPractise({demoAllowed: true, hasToken: true})).toBe(false)
  })

  it('refuses anyone who did not ask for it', () => {
    expect(canPractise({demoAllowed: false, hasToken: false})).toBe(false)
  })

  it('allows a visitor who opted in and has no session', () => {
    expect(canPractise({demoAllowed: true, hasToken: false})).toBe(true)
  })

  it('is closed by default in production, where demoAllowed needs ?demo', () => {
    // `demoAllowed` is `demoRequested || import.meta.env.DEV` — false in a
    // production build unless the URL carries ?demo or ?sim.
    expect(canPractise({demoAllowed: false, hasToken: true})).toBe(false)
  })
})
