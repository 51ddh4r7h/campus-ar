/**
 * Film-spot data model for the Campus Film Hunt MVP.
 *
 * Coordinates are REAL — extracted from geotagged photos of the Symbiosis
 * Lavale campus (Pune, Maharashtra). Ordered south → north so the set list
 * reads as a walking arc.
 *
 * `radiusM` is how close you must get before the spot unlocks. 15 m covers
 * normal phone-GPS scatter outdoors; 20 m is used where fixes drift
 * (viewpoints, building entrances).
 *
 * Movie pairings + blurbs are PLAYFUL FICTION for onboarding — swap freely.
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
  /** Reveal media: a fallback colour swatch + the clip that plays in-world
   *  and in the panel once you drop the file at public/clips/<id>.mp4. */
  asset: {
    color: string
    label: string
    videoUrl?: string
  }
}

export const FILM_SPOTS: FilmSpot[] = [
  {
    id: 'mind-studio',
    name: 'Mind Studio',
    lat: 18.5342614,
    lng: 73.7332691,
    radiusM: 15,
    movie: {
      title: 'Dear Zindagi',
      blurb: "Every hero gets the scene where they finally exhale. This is yours — the campus's quiet corner for when the semester gets loud.",
    },
    asset: {color: '#7FD1C0', label: 'clip-mind-studio exhale-01', videoUrl: '/clips/mind-studio.mp4'},
  },
  {
    id: 'aqua-point',
    name: 'Aqua Point',
    lat: 18.5357918,
    lng: 73.7333646,
    radiusM: 20,
    movie: {
      title: 'Dil Chahta Hai',
      blurb: 'Three friends, one hilltop, zero plans. The valley below has been waiting for your group photo since 2001.',
    },
    asset: {color: '#7EC8E3', label: 'clip-aqua-point valley-wide-02', videoUrl: '/clips/aqua-point.mp4'},
  },
  {
    id: 'fountain',
    name: 'The Fountain',
    lat: 18.5361451,
    lng: 73.7331103,
    radiusM: 15,
    movie: {
      title: '3 Idiots',
      blurb: "All is well — especially here, where every campus legend has cooled their heels between lectures.",
    },
    asset: {color: '#4FB3D9', label: 'clip-fountain all-is-well-03', videoUrl: '/clips/fountain.mp4'},
  },
  {
    id: 'library',
    name: 'Central Library',
    lat: 18.5368027,
    lng: 73.7326191,
    radiusM: 15,
    movie: {
      title: 'The Graduate',
      blurb: "The sprint past these steps has ended more movie chases than any other. Yours starts the moment exams do.",
    },
    asset: {color: '#FFE9AE', label: 'clip-library rosettes-04', videoUrl: '/clips/library.mp4'},
  },
  {
    id: 'auditorium',
    name: 'Auditorium',
    lat: 18.5367206,
    lng: 73.7324656,
    radiusM: 20,
    movie: {
      title: 'Whiplash',
      blurb: 'Every great performance starts with a tempo check. The stage behind these doors is where campus legends hit their mark.',
    },
    asset: {color: '#D94838', label: 'clip-auditorium curtain-05', videoUrl: '/clips/auditorium.mp4'},
  },
]

/** Look up a spot by id. */
export const spotById = (id: string): FilmSpot | undefined => FILM_SPOTS.find((s) => s.id === id)
