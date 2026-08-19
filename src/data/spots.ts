/**
 * Film-spot data model for the Campus Film Hunt MVP.
 *
 * Coordinates are PLACEHOLDERS — replace them with your campus's real spots.
 * They are spaced ~80–150 m apart around a generic campus centre so the
 * proximity gate behaves plausibly during testing.
 *
 * To set up real spots: drop pins on a campus map, read their lat/lng, and set
 * each `lat`/`lng` here. `radiusM` (default 15) is how close you must get
 * before the spot unlocks.
 */

export interface FilmSpot {
  id: string
  name: string
  lat: number
  lng: number
  /** How close (metres) you must be for the spot to unlock. */
  radiusM: number
  movie: {
    title: string
    /** One-line "filmed here" pitch, shown at the reveal. */
    blurb: string
  }
  /** Placeholder reveal asset — a colour + label. Swap for real media later. */
  asset: {
    color: string
    label: string
  }
}

export const FILM_SPOTS: FilmSpot[] = [
  {
    id: 'the-quad',
    name: 'The Quad',
    lat: 37.4279,
    lng: -122.1706,
    radiusM: 15,
    movie: {
      title: 'The Social Network',
      blurb: 'The midnight whiteboard run that changed a campus — and a decade — was shot on this very lawn.',
    },
    asset: {color: '#F3B93F', label: 'clip-quad-behind-the-scenes-01'},
  },
  {
    id: 'library-steps',
    name: 'Library Steps',
    lat: 37.4284,
    lng: -122.1692,
    radiusM: 15,
    movie: {
      title: 'The Graduate',
      blurb: "Benjamin's sprint to the chapel steps began here, three takes before the crew called 'cut'.",
    },
    asset: {color: '#FFE9AE', label: 'clip-steps-rosettes-02'},
  },
  {
    id: 'memorial-court',
    name: 'Memorial Court',
    lat: 37.4267,
    lng: -122.1689,
    radiusM: 15,
    movie: {
      title: 'Legally Blonde',
      blurb: "Elle's grand courthouse entrance swept through this court while the extras hid behind the fountain.",
    },
    asset: {color: '#D94838', label: 'clip-court-pink-03'},
  },
]

/** Look up a spot by id. */
export const spotById = (id: string): FilmSpot | undefined => FILM_SPOTS.find((s) => s.id === id)