/**
 * The reward ladder.
 *
 * Par-time scoring decides who wins, which only motivates the handful of
 * players who can still win it. By the third stop everyone else has no reason
 * left to walk — and at a real event that is exactly when people drift off.
 *
 * So there is a second, parallel reward that pays for *coverage* rather than
 * speed: clear a level, climb a rung. Slow players and fast players earn the
 * same ladder, so finishing is worth something to everybody. It is the
 * shopping-centre mechanic — the discount is for visiting every store, not for
 * getting round the fastest.
 *
 * Rungs hang off the level number, never off the location. Routes are
 * randomised, so one player's third stop is another's first; tying rewards to
 * places would hand two people different prizes for identical work.
 */

export interface Perk {
  /** Level that earns it, 1-5. */
  rung: number
  name: string
  /** What the player is told they have won. */
  blurb: string
  /** True when it changes the rules rather than just saying well done. */
  mechanical: boolean
}

export const PERKS: readonly Perk[] = [
  {
    rung: 1,
    name: 'On the call sheet',
    blurb: "You've found your first location. The rest of the shoot is out there.",
    mechanical: false,
  },
  {
    rung: 2,
    name: 'One more take',
    blurb: 'An extra free viewing on every level from here — watch without paying for it.',
    mechanical: true,
  },
  {
    rung: 3,
    name: 'Ask the locals',
    blurb: 'One hint, free. Take it whenever you like; it costs you nothing.',
    mechanical: true,
  },
  {
    rung: 4,
    name: 'Stills photographer',
    blurb: 'Photo mode. Capture yourself at a location with the scene playing behind you.',
    mechanical: true,
  },
  {
    rung: 5,
    name: 'The wrap',
    blurb: 'Every location on campus, including the ones your route never sent you to.',
    mechanical: true,
  },
]

/** The rung earned by finishing `level`, or null if that level has none. */
export const perkForLevel = (level: number): Perk | null =>
  PERKS.find((p) => p.rung === level) ?? null

/** Rungs a player has climbed, given the level they are now on (1-6). */
export const perksEarned = (currentLevel: number): readonly Perk[] =>
  PERKS.filter((p) => p.rung < currentLevel)

/** Extra free viewings per level, earned at rung 2. */
export const bonusViews = (currentLevel: number): number => (currentLevel > 2 ? 1 : 0)

/** Whether the free-hint credit from rung 3 is available yet. */
export const hasHintCredit = (currentLevel: number): boolean => currentLevel > 3

/** Whether photo mode has been unlocked (rung 4). */
export const canPhotograph = (currentLevel: number): boolean => currentLevel > 4
