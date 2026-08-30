/** Time formatting for the hunt clock and the leaderboard. */

/** `M:SS`, or `S.s` under a minute — the in-game clock voice. */
export const formatClock = (ms: number): string => {
  const total = Math.max(0, Math.floor(ms / 1000))
  const m = Math.floor(total / 60)
  const s = total % 60
  if (m === 0) return `${s}.${Math.floor((ms % 1000) / 100)}`
  return `${m}:${String(s).padStart(2, '0')}`
}

/** `M:SS`, zero-padded — the leaderboard voice. */
export const formatMarquee = (ms: number): string => {
  const total = Math.round(Math.max(0, ms) / 1000)
  const m = Math.floor(total / 60)
  const s = total % 60
  return `${m}:${String(s).padStart(2, '0')}`
}

/** Signed `±M:SS` for a score-vs-par value (lower is better). */
export const formatScore = (ms: number): string =>
  `${ms <= 0 ? '−' : '+'}${formatMarquee(Math.abs(ms))}`
