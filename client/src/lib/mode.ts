/**
 * Entry mode, decided from the URL once at load.
 *
 *  - `?t=<token>&b=<batchId>[&n=<name>]` — a personalised player link (production)
 *  - `?demo` / `?sim`                    — a simulated practice run
 *  - anything else                       — no way in (a "your link is personal"
 *    screen), except in dev builds where practice is always allowed
 */

const params =
  typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : new URLSearchParams()

export const playerLink =
  params.get('t') && params.get('b')
    ? {token: params.get('t')!, batchId: params.get('b')!, name: params.get('n') ?? 'Player'}
    : null

export const demoRequested = params.has('demo') || params.has('sim')

/** Practice runs are allowed when explicitly requested, or in any dev build. */
export const demoAllowed = demoRequested || import.meta.env.DEV
