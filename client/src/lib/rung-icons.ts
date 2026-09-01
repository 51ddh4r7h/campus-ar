/**
 * A glyph per ladder rung.
 *
 * Drawn in our own 24px line set rather than sourced: the rungs are named for
 * jobs on a film crew, so the icons belong to the same world as the rest of the
 * app. Bought badge art would pull towards trophies and rosettes, which is a
 * different game than this one — and it would add licence debt for something
 * four path strings can do.
 *
 * Rung 3 deliberately reuses the hint glyph. It *is* a hint, so wearing the
 * same face as the Hint button says what it does without a word of copy.
 */

import type {IconName} from './components/Icon.svelte'

const BY_RUNG = {
  1: 'callsheet',
  2: 'clapper',
  3: 'bulb',
  4: 'camera',
  5: 'reel',
} satisfies Record<number, IconName>

type Rung = keyof typeof BY_RUNG

const isRung = (n: number): n is Rung => n in BY_RUNG

export const rungIcon = (rung: number): IconName => (isRung(rung) ? BY_RUNG[rung] : 'film')
