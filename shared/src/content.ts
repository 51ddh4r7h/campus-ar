/**
 * Campus content.
 *
 * PLACE NAMES AND COORDINATES ARE REAL — every one is a named feature in
 * OpenStreetMap on the Lavale hilltop, pulled by `npm run map`. They are here
 * so the geofencing, spacing and the campus plan are computed against the
 * actual site rather than invented geography.
 *
 * EVERYTHING ELSE IS PROVISIONAL. Which production was shot where, what
 * happens in each scene, and the campus facts are unknown until the scene list
 * arrives; `movie.title` says so, `campusFact` is deliberately empty rather
 * than filled with plausible-sounding fiction, and the clue ladders describe
 * only what the map can vouch for (a theatre has tiered seating, a mess hall
 * has tables). Rewrite all of it against the real scenes.
 *
 * The ten below are a spread across the hilltop, not a claim about where
 * anything was filmed.
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
    id: 'amphitheatre',
    name: 'Amphitheatre',
    lat: 18.53751,
    lng: 73.73132,
    radiusM: 18,
    difficulty: 1,
    ...media('amphitheatre'),
    movie: {title: 'TBC — pending the scene list', blurb: ''},
    campusFact: '',
    clue: {
      far: 'Tiered steps curve around an open stage, with nothing above but sky.',
      warm: 'Built so a crowd can sit and watch something in the open air.',
      close: 'The curved seating up beside the institute blocks.',
    },
  },
  {
    id: 'symbieat',
    name: 'Symbieat',
    lat: 18.53739,
    lng: 73.73234,
    radiusM: 18,
    difficulty: 2,
    ...media('symbieat'),
    movie: {title: 'TBC — pending the scene list', blurb: ''},
    campusFact: '',
    clue: {
      far: 'Where people queue for something hot between classes.',
      warm: 'A counter, some tables, and the smell of frying.',
      close: 'The eatery next to the media block.',
    },
  },
  {
    id: 'simc',
    name: 'SIMC',
    lat: 18.53675,
    lng: 73.7316,
    radiusM: 18,
    difficulty: 2,
    ...media('simc'),
    movie: {title: 'TBC — pending the scene list', blurb: ''},
    campusFact: '',
    clue: {
      far: 'A teaching block everyone refers to by four letters.',
      warm: 'Where the media students spend their days.',
      close: 'The institute building on the upper road.',
    },
  },
  {
    id: 'rangoli',
    name: 'Rangoli',
    lat: 18.5343,
    lng: 73.73337,
    radiusM: 18,
    difficulty: 2,
    ...media('rangoli'),
    movie: {title: 'TBC — pending the scene list', blurb: ''},
    campusFact: '',
    clue: {
      far: 'A building sharing its name with a pattern drawn on the floor.',
      warm: 'One of the residential blocks on the middle level.',
      close: 'The block just above the dining hall.',
    },
  },
  {
    id: 'mess',
    name: 'Mess',
    lat: 18.53371,
    lng: 73.73318,
    radiusM: 18,
    difficulty: 1,
    ...media('mess'),
    movie: {title: 'TBC — pending the scene list', blurb: ''},
    campusFact: '',
    clue: {
      far: 'Long tables, steel trays, and the loudest room at eight in the morning.',
      warm: 'Where the whole campus eats.',
      close: 'The dining hall on the middle level.',
    },
  },
  {
    id: 'multi-purpose-ground',
    name: 'Multi Purpose Ground',
    lat: 18.5328,
    lng: 73.73221,
    radiusM: 18,
    difficulty: 1,
    ...media('multi-purpose-ground'),
    movie: {title: 'TBC — pending the scene list', blurb: ''},
    campusFact: '',
    clue: {
      far: 'Flat, open, and marked out for more than one game.',
      warm: 'The largest open ground here.',
      close: 'The playing field below the hostels.',
    },
  },
  {
    id: 'swimming-pool',
    name: 'Swimming Pool',
    lat: 18.53184,
    lng: 73.73329,
    radiusM: 18,
    difficulty: 2,
    ...media('swimming-pool'),
    movie: {title: 'TBC — pending the scene list', blurb: ''},
    campusFact: '',
    clue: {
      far: 'Blue water, lane markings, and a very particular smell.',
      warm: 'Somewhere you come to train rather than to study.',
      close: 'Beside the sports facilities on the lower level.',
    },
  },
  {
    id: 'calendula',
    name: 'Calendula',
    lat: 18.53208,
    lng: 73.73377,
    radiusM: 18,
    difficulty: 3,
    ...media('calendula'),
    movie: {title: 'TBC — pending the scene list', blurb: ''},
    campusFact: '',
    clue: {
      far: 'Named after a flower, like the blocks around it.',
      warm: 'A residential block on the lower level.',
      close: 'One of the flower-named hostels.',
    },
  },
  {
    id: 'lotus',
    name: 'Lotus',
    lat: 18.53172,
    lng: 73.73187,
    radiusM: 18,
    difficulty: 3,
    ...media('lotus'),
    movie: {title: 'TBC — pending the scene list', blurb: ''},
    campusFact: '',
    clue: {
      far: 'Another flower, another block, another flight of stairs.',
      warm: 'A hostel among several with botanical names.',
      close: 'The block nearest the open ground.',
    },
  },
  {
    id: 'petunia',
    name: 'Petunia',
    lat: 18.53189,
    lng: 73.73076,
    radiusM: 18,
    difficulty: 3,
    ...media('petunia'),
    movie: {title: 'TBC — pending the scene list', blurb: ''},
    campusFact: '',
    clue: {
      far: 'The furthest of the flower-named blocks.',
      warm: 'A hostel at the far edge of the residential cluster.',
      close: 'The last block before the road bends away.',
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
