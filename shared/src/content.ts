/**
 * The ten campus locations.
 *
 * The first five (mind-studio, aqua-point, the-fountain, central-library,
 * auditorium) carry REAL coordinates read from geotagged campus photos in
 * content/location-photos/. `auditorium` is nudged ~40 m SW to its forecourt so
 * its radius clears the library's. The other five are spread placeholders
 * pending survey. Film pairings, clue ladders and campus facts are drafts for
 * wiring, not final copy — finalised in Phase 5 (docs/BUILD-PLAN.md).
 *
 * mind-studio uses the real clip in the AWS S3 bucket (public, CORS *, range
 * requests) — it's the verified Level-1 demo scene.
 *
 * Invariants the content must satisfy before an event:
 *  - exactly LOCATION_POOL_SIZE entries
 *  - no two geofences overlap (with a small buffer)
 *  - difficulty mix of roughly 3 / 4 / 3 across tiers 1 / 2 / 3
 *  - no clue rung names the building, the film, or a compass direction
 */

import type {LatLng} from './geo'
import type {GameLocation} from './types'
import {deriveLimits, safeRadiusM} from './layout'

/**
 * Shared assembly point. Every player's clock and Level-1 walk par start here,
 * so the opening leg is fair regardless of which clue they draw first. A batch
 * may override this; the value is a placeholder pending survey.
 */
export const START_POINT: LatLng = {lat: 18.53390, lng: 73.73340}

/**
 * Reward media is served from the app's own origin (`client/public/clips/`) —
 * no third-party host, no cross-origin load to fail, no CORS taint on the AR
 * video texture.
 */
const media = (id: string): Pick<GameLocation, 'clipUrl' | 'posterUrl' | 'sceneRefImage'> => ({
  clipUrl: `/clips/${id}.mp4`,
  posterUrl: `/clips/${id}-poster.jpg`,
  sceneRefImage: `/clips/${id}-poster.jpg`,
})

/** As surveyed. `radiusM` here is a *request* — see LOCATIONS below. */
const SURVEYED: readonly GameLocation[] = [
  {
    id: 'mind-studio',
    name: 'Mind Studio',
    lat: 18.5342614,
    lng: 73.7332691,
    radiusM: 18,
    difficulty: 1,
    ...media('mind-studio'),
    movie: {title: 'The Quiet Quarter', blurb: 'Every hero gets the scene where they finally exhale.'},
    campusFact: 'The studio wing was the first building on campus wired for natural-light filming.',
    clue: {
      far: 'A quiet room where someone finally lets a long breath go.',
      warm: 'Glass on one whole wall, and a lawn that catches the last of the sun.',
      close: 'Look for the low building whose windows run floor to ceiling on the quad side.',
    },
  },
  {
    id: 'aqua-point',
    name: 'Aqua Point',
    lat: 18.5357918,
    lng: 73.7333646,
    radiusM: 18,
    difficulty: 2,
    ...media('aqua-point'),
    movie: {title: 'Blue Hour', blurb: 'Three friends, one hilltop, zero plans for the afternoon.'},
    campusFact: 'The reservoir here holds the campus through the dry months before the monsoon.',
    clue: {
      far: 'Three friends, a wide-open view, and no plan for the afternoon.',
      warm: 'Water below, the valley beyond, a place people stop to just look.',
      close: 'Head for the open edge where the ground drops away toward the reservoir.',
    },
  },
  {
    id: 'the-fountain',
    name: 'The Fountain',
    lat: 18.5361451,
    lng: 73.7331103,
    radiusM: 14,
    difficulty: 1,
    ...media('the-fountain'),
    movie: {title: 'After the Bell', blurb: 'All is well — especially here, between lectures.'},
    campusFact: 'Every graduating class has thrown a coin in on their last day since the first batch.',
    clue: {
      far: 'Wherever this is, the characters keep insisting that all is well.',
      warm: 'A circle of stone, moving water, benches worn smooth by years of waiting.',
      close: 'The paved circle at the centre of the main walk, with water in the middle.',
    },
  },
  {
    id: 'central-library',
    name: 'Central Library',
    lat: 18.5368027,
    lng: 73.7326191,
    radiusM: 15,
    difficulty: 2,
    ...media('central-library'),
    movie: {title: 'The Rosette Run', blurb: 'The sprint past these steps has ended more chases than any other.'},
    campusFact: 'The reading room stays open through exam week for the only all-night hours on campus.',
    clue: {
      far: 'A frantic run up a long flight of steps, late for something that matters.',
      warm: 'Broad steps, tall doors, and more windows than you can count in a row.',
      close: 'The building with the widest staircase on campus, facing the central lawn.',
    },
  },
  {
    id: 'auditorium',
    name: 'Auditorium',
    lat: 18.53642,
    lng: 73.73215,
    radiusM: 16,
    difficulty: 3,
    ...media('auditorium'),
    movie: {title: 'First Take', blurb: 'Every great performance starts with a tempo check.'},
    campusFact: 'The stage curtain is still raised by hand on opening night, a rule since 1968.',
    clue: {
      far: 'A performer pushed past breaking point to hit an impossible tempo.',
      warm: 'Doors that only open for an audience, and a foyer that is dark by day.',
      close: 'The tall windowless hall next to the library, set back behind its own forecourt.',
    },
  },
  {
    id: 'the-amphitheatre',
    name: 'The Amphitheatre',
    lat: 18.53525,
    lng: 73.7338,
    radiusM: 18,
    difficulty: 2,
    ...media('the-amphitheatre'),
    movie: {title: 'Open Air', blurb: 'A crowd on stone tiers, holding its breath together.'},
    campusFact: 'Orientation week ends with the whole incoming cohort seated on these steps.',
    clue: {
      far: 'A crowd on stone tiers, watching something happen down in the middle.',
      warm: 'Curved steps cut into a slope, an open floor at the bottom, no roof.',
      close: 'The tiered stone bowl on the hillside below the academic block.',
    },
  },
  {
    id: 'sports-pavilion',
    name: 'Sports Pavilion',
    lat: 18.5344,
    lng: 73.734,
    radiusM: 22,
    difficulty: 2,
    ...media('sports-pavilion'),
    movie: {title: 'The Long Season', blurb: 'The match everyone remembers started on an empty field.'},
    campusFact: 'The ground floods to a shallow sheet in heavy rain and drains clear within the hour.',
    clue: {
      far: 'The long shot before the big match: an empty field at first light.',
      warm: 'A covered stand looking out over the largest flat green space on campus.',
      close: 'The roofed viewing stand along the edge of the main playing field.',
    },
  },
  {
    id: 'founders-steps',
    name: "Founders' Steps",
    lat: 18.53655,
    lng: 73.73355,
    radiusM: 16,
    difficulty: 3,
    ...media('founders-steps'),
    movie: {title: 'Seven Names', blurb: 'Two people, a staircase, and a whole town behind them.'},
    campusFact: 'The plaque at the top lists the seven people who signed for the land in 1971.',
    clue: {
      far: 'Two people talk on a staircase while the whole town lies behind them.',
      warm: 'A climb that turns back on itself, with a named plaque somewhere near the top.',
      close: 'The switchback stone stairway connecting the lower road to the main gate.',
    },
  },
  {
    id: 'the-boulevard',
    name: 'The Boulevard',
    lat: 18.535,
    lng: 73.7326,
    radiusM: 18,
    difficulty: 1,
    ...media('the-boulevard'),
    movie: {title: 'Last Reel', blurb: 'A slow walk down the avenue while the credits could roll any second.'},
    campusFact: 'The trees along it were planted by the first five batches, one row per year.',
    clue: {
      far: 'A slow walk down a tree-lined avenue while the credits could roll any second.',
      warm: 'A straight paved avenue, tall trees both sides, benches at every gap.',
      close: 'The long tree-lined path that runs the length of the central campus.',
    },
  },
  {
    id: 'observatory-deck',
    name: 'Observatory Deck',
    lat: 18.53725,
    lng: 73.7331,
    radiusM: 20,
    difficulty: 3,
    ...media('observatory-deck'),
    movie: {title: 'Nightwatch', blurb: 'A rooftop conversation under an enormous sky.'},
    campusFact: 'On a clear night you can pick out four hill forts from the railing.',
    clue: {
      far: 'A rooftop conversation under an enormous sky, city lights far below.',
      warm: 'The highest point you can stand on here, with a railing and nothing above it.',
      close: 'The flat viewing platform on the roof of the northern-most building.',
    },
  },
]

if (SURVEYED.length !== 10) {
  throw new Error(`content: expected 10 locations, found ${SURVEYED.length}`)
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
