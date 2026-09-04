/**
 * Campus content — the real scene list.
 *
 * Every location here is a place a scene was actually shot, at coordinates
 * surveyed on site with GPS Map Camera (see `Clips Master Sheet`). Clue text is
 * written from the frames themselves: it describes what is visible in the shot,
 * never something invented about the place.
 *
 * TWELVE sites were surveyed. NINE are in play. Three are parked, not because
 * anything is wrong with the clips but because they sit too close to another
 * site for consumer GPS to tell apart — see PARKED below. That is a physical
 * limit, not a tuning choice: a fence you cannot stand outside of is not a
 * fence. Re-survey any of them a little further out and it can come straight
 * back in.
 *
 * The coordinates come from the GPS stamps in the master sheet, paired to rows
 * by where each stamp sits on the page. That detail matters: the stamps are NOT
 * stored in row order in the file, and reading them in file order silently
 * swapped two pairs — Behind SSBF with SIDTM Admin (about 96m apart) and the
 * Library with SIU Admin (34m). Both fences were in the wrong place. If these
 * are ever re-extracted, pair by position, never by order.
 *
 * `difficulty` is the organiser's own marking from the master sheet — Easy is
 * tier 1, Difficult is tier 3. It is not a guess from the footage: an earlier
 * pass read the fountain as the easiest shot on the list and it is marked
 * Difficult. Tier 2 is unused for now; nothing was marked in between.
 *
 * Still to fill in: `campusFact` is deliberately empty rather than filled with
 * plausible fiction. Par times per tier are first drafts to be recalibrated
 * against the first batch's real leg times.
 */

import type {LatLng} from './geo'
import type {GameLocation} from './types'
import {deriveLimits, safeRadiusM} from './layout'

/**
 * Shared assembly point. Every player's clock and Level-1 walk par start here,
 * so the opening leg is fair regardless of which clue they draw first. Sits
 * roughly in the middle of the play area; replace with the real muster point
 * once the organisers pick one.
 */
export const START_POINT: LatLng = {lat: 18.53715, lng: 73.73215}

/**
 * Reward media is served from the app's own origin (`client/public/clips/`).
 *
 * This is not just about a flaky host. The AR screen paints the clip as a WebGL
 * video texture and photo mode reads pixels back off that canvas — a
 * cross-origin video without correct CORS headers taints the canvas and makes
 * the capture throw. Same-origin removes the whole class of problem.
 */
const media = (id: string): Pick<GameLocation, 'clipUrl' | 'posterUrl' | 'sceneRefImage'> => ({
  clipUrl: `/clips/${id}.mp4`,
  posterUrl: `/clips/${id}-poster.jpg`,
  sceneRefImage: `/clips/${id}-poster.jpg`,
})

const BODYGUARD = 'Bodyguard'
const HOSTEL_DAZE = 'Hostel Daze'

/**
 * Surveyed, and in play. `radiusM` here is a *request* — LOCATIONS below shrinks
 * it to whatever the nearest neighbour actually leaves room for.
 *
 * Numbers in the comments are the row in the master sheet, kept so a clip can
 * be traced back to its source.
 */
const SURVEYED: readonly GameLocation[] = [
  {
    // Sheet 1 — behind ssbf
    id: 'behind-ssbf',
    name: 'Behind SSBF',
    lat: 18.538066,
    lng: 73.731658,
    radiusM: 15,
    difficulty: 1,
    ...media('behind-ssbf'),
    movie: {
      title: BODYGUARD,
      blurb: 'A chase down the stone arcade, the whole cast strung out along the colonnade.',
    },
    campusFact: '',
    clue: {
      far: 'A long covered walk of rough stone, cut through by square openings that let the daylight in.',
      warm: 'Squat stone pillars on both sides, with lawn showing through the gaps.',
      close: 'The arcade running along the back of the banking and finance block.',
    },
  },
  {
    // Sheet 2 — Sibm
    id: 'sibm',
    name: 'SIBM',
    lat: 18.537566,
    lng: 73.731803,
    radiusM: 15,
    difficulty: 1,
    ...media('sibm'),
    movie: {
      title: BODYGUARD,
      blurb: 'Crossing the forecourt in front of the institute, students all around.',
    },
    campusFact: '',
    clue: {
      far: 'A wide open forecourt under a run of white angled struts, with a curved brick wall on one side.',
      warm: 'Patterned paving, long benches, and a noticeboard on the brick.',
      close: 'The courtyard outside the business management institute.',
    },
  },
  {
    // Sheet 3 — sidtm admin office
    id: 'sidtm-admin',
    name: 'SIDTM Admin Office',
    lat: 18.537202,
    lng: 73.731891,
    radiusM: 15,
    difficulty: 1,
    ...media('sidtm-admin'),
    movie: {
      title: BODYGUARD,
      blurb: 'A phone call taken on the move, seen through the glass of the office frontage.',
    },
    campusFact: '',
    clue: {
      far: 'A glass frontage with orange columns, and a printed list of departments beside the door.',
      warm: 'You are looking through glass into a lobby — reflections of the walkway on it.',
      close: 'The admin office at the telecom and digital management institute.',
    },
  },
  {
    // Sheet 7 — fountain
    id: 'fountain',
    name: 'The Fountain',
    lat: 18.536108,
    lng: 73.732878,
    radiusM: 15,
    difficulty: 3,
    ...media('fountain'),
    movie: {
      title: BODYGUARD,
      blurb: 'A busy establishing shot: the broad steps, the canopy, and the water running.',
    },
    campusFact: '',
    clue: {
      far: 'A broad flight of steps up to a building under a white sail-shaped canopy, with the wooded hillside behind.',
      warm: 'Water on one side of the steps, a clock on the building opposite.',
      close: 'The steps and the fountain below them.',
    },
  },
  {
    // Sheet 8 — Library
    id: 'library',
    name: 'Library',
    lat: 18.536825,
    lng: 73.732653,
    radiusM: 15,
    difficulty: 3,
    ...media('library'),
    movie: {
      title: BODYGUARD,
      blurb: 'An argument in a doorway, half in and half out of the hall.',
    },
    campusFact: '',
    clue: {
      far: 'Tall pale doors standing open, with the tail of a sign visible on the wall above them.',
      warm: 'Pale panelling, a bin beside the door, shelving just inside.',
      close: 'The doors into the library.',
    },
  },
  {
    // Sheet 9 — SIU admin office
    id: 'siu-admin',
    name: 'SIU Admin Office',
    lat: 18.53653,
    lng: 73.732741,
    radiusM: 15,
    difficulty: 3,
    ...media('siu-admin'),
    movie: {
      title: BODYGUARD,
      blurb: 'Three of them stopped mid-conversation at the foot of the stairs.',
    },
    campusFact: '',
    clue: {
      far: 'A pale open hall with a staircase climbing across the back of it, and a brick pier at one side.',
      warm: 'Potted palms at the foot of the stairs; a mezzanine walkway above.',
      close: 'The university administration building.',
    },
  },
  {
    // Sheet 10 — Amphitheatre
    id: 'amphitheatre',
    name: 'Amphitheatre',
    lat: 18.537528,
    lng: 73.731222,
    radiusM: 15,
    difficulty: 1,
    ...media('amphitheatre'),
    movie: {
      title: BODYGUARD,
      blurb: 'The big song: hundreds of dancers packing the tiers, one figure on the central stair.',
    },
    campusFact: '',
    clue: {
      far: 'Wide stone tiers stepping down towards a stage, with a stair cut straight through the middle.',
      warm: 'Open to the sky. Seating enough for hundreds, all facing one way.',
      close: 'The amphitheatre.',
    },
  },
  {
    // Sheet 11 — Symbieat
    id: 'symbieat',
    name: 'Symbi Eat',
    lat: 18.537331,
    lng: 73.732295,
    radiusM: 15,
    difficulty: 1,
    ...media('symbieat'),
    movie: {
      title: HOSTEL_DAZE,
      blurb: 'A birthday at a table after dark — candles, party hats, and the cake.',
    },
    campusFact: '',
    clue: {
      far: 'Shot after dark at a table, with foliage behind and nothing of the building in frame.',
      warm: 'Somewhere people sit down to eat together in the evening.',
      close: 'The food court.',
    },
  },
  {
    // Sheet 12 — outside C hall
    id: 'outside-c-hall',
    name: 'Outside C Hall',
    lat: 18.536958,
    lng: 73.731443,
    radiusM: 15,
    difficulty: 1,
    ...media('outside-c-hall'),
    movie: {
      title: HOSTEL_DAZE,
      blurb: 'Two of them messing about on the grass outside the hall with a hosepipe.',
    },
    campusFact: '',
    clue: {
      far: 'A clipped lawn in front of a brick and white building, with a single tree breaking the frontage.',
      warm: 'A low hedge along the edge of the grass, and a stairway at the far end of the block.',
      close: 'The lawn outside C hall.',
    },
  },
]

/**
 * Surveyed but NOT in play — each sits inside a neighbour's fence.
 *
 * Consumer GPS on this hilltop resolves to roughly ±10-20m. Two stops closer
 * together than that cannot be separated at all: a player standing at one is
 * physically inside the other, so an arrival could validate the wrong level, or
 * refuse the right one. `ABSOLUTE_MIN_SPACING_M` in ./layout is the floor, and
 * these three are under it against the neighbour named.
 *
 * Kept here rather than deleted: the clips are fine, and a fresh survey a few
 * dozen metres away — or dropping the neighbour instead — brings any of them
 * straight back.
 */
export const PARKED = [
  {sheet: 4, id: 'auditorium', name: 'Auditorium', lat: 18.536747, lng: 73.732526, clashesWith: 'library', gapM: 16, difficulty: 1},
  {sheet: 5, id: 'xerox', name: 'Xerox', lat: 18.537208, lng: 73.731825, clashesWith: 'sidtm-admin', gapM: 7, difficulty: 1},
  {sheet: 6, id: 'behind-amphi', name: 'Behind Amphi', lat: 18.537417, lng: 73.731713, clashesWith: 'sibm', gapM: 19, difficulty: 3},
] as const

if (SURVEYED.length !== 9) {
  throw new Error(`content: expected 9 locations, found ${SURVEYED.length}`)
}

/**
 * Every distance-sensitive threshold, derived from the surveyed coordinates.
 * Pack the stops tighter and these tighten with them — see ./layout.
 */
export const LAYOUT = deriveLimits(SURVEYED)

/**
 * The playable locations: as surveyed, but with each geofence shrunk to what
 * its neighbours actually leave room for. A stop out on its own keeps the
 * radius it asked for; one with company gets a tighter, honest fence.
 */
export const LOCATIONS: readonly GameLocation[] = SURVEYED.map((l) => ({
  ...l,
  radiusM: safeRadiusM(l, SURVEYED, l.radiusM),
}))

const LOCATION_BY_ID = new Map(LOCATIONS.map((l) => [l.id, l]))

export const locationById = (id: string): GameLocation | undefined => LOCATION_BY_ID.get(id)
