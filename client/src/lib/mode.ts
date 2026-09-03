/**
 * Entry mode, decided from the URL once at load.
 *
 *  - `?t=<token>&b=<batchId>[&n=<name>]` — a personalised player link (production)
 *  - `?e=<code>`                         — a cohort's shared signup link
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

/**
 * `?e=<code>` — the shared signup link for a cohort. Lands the player on the
 * sign-in / create-account screen for that batch. One link for everyone;
 * players tell themselves apart by roll number + password.
 */
export const eventCode = params.get('e')?.trim() || null

/** `?debug` — show the on-screen AR diagnostic readout on the reveal. */
export const debugMode = params.has('debug')

/**
 * `?admin` — the organiser console. Gated at runtime by the admin key, which
 * the organiser types in; it is never part of the bundle.
 */
export const adminRequested = params.has('admin')

/** Practice runs are allowed when explicitly requested, or in any dev build. */
export const demoAllowed = demoRequested || import.meta.env.DEV
