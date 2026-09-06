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

  it('is closed unless the URL asked, in every build', () => {
    // `demoAllowed` is now exactly `demoRequested` — no development exception,
    // so what is tested locally is what ships.
    expect(canPractise({demoAllowed: false, hasToken: true})).toBe(false)
  })
})

/**
 * A practice session must not survive onto a real link.
 *
 * Starting one replaces the stored token with the practice player's, so the
 * plain event link would restore it and hand back a simulated hunt without the
 * URL ever mentioning practice.
 */
const keepSession = (opts: {sessionIsDemo: boolean; demoAllowed: boolean}): boolean =>
  !opts.sessionIsDemo || opts.demoAllowed

describe('resuming a stored session', () => {
  it('drops a practice session on a plain link', () => {
    expect(keepSession({sessionIsDemo: true, demoAllowed: false})).toBe(false)
  })

  it('keeps a practice session on ?demo', () => {
    expect(keepSession({sessionIsDemo: true, demoAllowed: true})).toBe(true)
  })

  it('always keeps a real session', () => {
    expect(keepSession({sessionIsDemo: false, demoAllowed: false})).toBe(true)
    expect(keepSession({sessionIsDemo: false, demoAllowed: true})).toBe(true)
  })
})
