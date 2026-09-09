/**
 * Server failures, in words a player can act on.
 *
 * EngineError's message defaults to its own code when none is given, so
 * reporting `err.message` verbatim put strings like `already_started` in front
 * of players. Codes are for logs. This is the other half of the earlier fix
 * that stopped every failure being blamed on the network: saying *what* went
 * wrong only helps if the sentence is one a person can read.
 */
export const SESSION_ERRORS = {
  already_started: 'This hunt has already been played.',
  not_in_progress: "This hunt isn't running.",
  not_finished: 'Finish or end this hunt before playing again.',
  bad_token: 'Your session has expired — sign in again.',
  batch_not_found: "That event doesn't exist any more.",
  signups_closed: 'This event has closed.',
  roster_taken: 'That roll number is already registered — sign in instead.',
  player_not_found: "That player isn't in this batch.",
  bad_password: 'Wrong roll number or password.',
  pool_empty: 'No route could be assigned. Tell an organiser.',
  hint_locked: "Take the hints in order — the nudge first.",
  internal: 'Something went wrong on our side. Try again.',
} as const

const isKnown = (code: string): code is keyof typeof SESSION_ERRORS =>
  Object.hasOwn(SESSION_ERRORS, code)

/** A sentence for a failure code, falling back to the server's own message. */
export const readableError = (code: string, fallback: string): string =>
  isKnown(code) ? SESSION_ERRORS[code] : fallback
