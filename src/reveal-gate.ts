/**
 * The reveal gate — the hunt's signature rule as a pure state machine.
 *
 * Rule: the reveal fires only after the player stands INSIDE the active
 * spot's radius for REVEAL_INSIDE_MS of continuous tracking. Leaving the
 * radius resets the clock; tracking loss merely pauses it (those frames
 * neither count nor erase progress).
 *
 * Pure in/out: no DOM, no GPS, no engine — the frame loop (ar.ts) feeds it,
 * which makes the rule unit-testable without any of those.
 */

export const REVEAL_INSIDE_MS = 2000

export interface GateInput {
  /** Player is inside the active spot's radius. */
  inside: boolean
  /** Engine reports NORMAL tracking. */
  trackingNormal: boolean
  /** Frame delta in ms (clamped upstream). */
  dtMs: number
}

export type GateVerdict = 'idle' | 'fire'

export interface RevealGate {
  tick(input: GateInput): GateVerdict
  reset(): void
  /** 0–1 progress toward firing (for future UI, e.g. a charging ring). */
  progress(): number
}

export function createRevealGate(): RevealGate {
  let insideMs = 0

  return {
    tick({inside, trackingNormal, dtMs}) {
      if (!inside) {
        insideMs = 0
        return 'idle'
      }
      if (trackingNormal) insideMs += Math.min(Math.max(0, dtMs), 64)
      return insideMs >= REVEAL_INSIDE_MS ? 'fire' : 'idle'
    },

    reset() {
      insideMs = 0
    },

    progress: () => Math.min(1, insideMs / REVEAL_INSIDE_MS),
  }
}
