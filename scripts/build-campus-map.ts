/**
 * Bake the campus plan from OpenStreetMap into a static asset.
 *
 * Run when the surveyed coordinates change:  npm run map
 *
 * The geometry is fetched once and committed rather than requested at runtime.
 * A player on a hilltop with two bars should not need a third-party map server
 * to see where they have been, and OSM's tile policy is not written for an app
 * hammering it on induction day. Baking also lets the plan be drawn in the
 * app's own palette instead of pasting a bright grey-and-green tile into a
 * dark cinematic interface.
 *
 * Data © OpenStreetMap contributors, ODbL. The attribution is a licence
 * condition and is rendered on the map itself — see CampusMap.svelte.
 */

import {writeFileSync} from 'node:fs'
import {LOCATIONS} from '../shared/src/index'

const PAD_M = 60
const OUT_W = 640

/**
 * The campus itself sets the extent, not the stops. Fitting the plan to
 * wherever the scenes happen to be would crop the hilltop to whatever corner
 * this year's locations sit in; the wrap is supposed to show the whole place.
 */
const CAMPUS = 'Symbiosis International University'

/** Tags worth drawing, in the order they should be painted. */
const LAYERS = [
  {key: 'natural', value: 'wood', kind: 'wood'},
  {key: 'landuse', value: null, kind: 'land'},
  {key: 'natural', value: 'water', kind: 'water'},
  {key: 'waterway', value: null, kind: 'water'},
  {key: 'leisure', value: null, kind: 'pitch'},
  {key: 'building', value: null, kind: 'building'},
  {key: 'highway', value: null, kind: 'road'},
  {key: 'amenity', value: 'university', kind: 'campus'},
  // SIMC and SIBM are mapped as college areas with no building tag, so without
  // this the institutes simply are not on the plan.
  {key: 'amenity', value: 'college', kind: 'building'},
] as const

type Kind = (typeof LAYERS)[number]['kind']

interface Way {
  tags?: Record<string, string>
  geometry?: Array<{lat: number; lon: number}>
}

const classify = (tags: Record<string, string>): Kind | null => {
  for (const l of LAYERS) {
    const v = tags[l.key]
    if (v !== undefined && (l.value === null || v === l.value)) return l.kind
  }
  return null
}

/** Ask OSM where the campus actually is, rather than guessing a box. */
async function campusBounds(): Promise<{s: number; w: number; n: number; e: number}> {
  const q = `[out:json][timeout:60];way["amenity"="university"]["name"="${CAMPUS}"](18.52,73.71,18.55,73.75);out geom;`
  const r = await overpass(q)
  const way = (r.elements as Way[]).find((w) => (w.geometry?.length ?? 0) > 3)
  if (!way?.geometry) throw new Error(`no boundary found for "${CAMPUS}"`)
  const la = way.geometry.map((g) => g.lat)
  const lo = way.geometry.map((g) => g.lon)
  return {s: Math.min(...la), n: Math.max(...la), w: Math.min(...lo), e: Math.max(...lo)}
}

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms))

/**
 * Overpass is a free, shared service. Three queries back to back earn a 429,
 * and rightly so — space them out and retry rather than hammering.
 */
async function overpass(q: string, attempt = 0): Promise<{elements: unknown[]}> {
  // Overpass refuses anonymous clients, and OSM's usage policy asks callers to
  // identify themselves. This runs once at build time, never from a player.
  const res = await fetch(`https://overpass-api.de/api/interpreter?data=${encodeURIComponent(q)}`, {
    headers: {'User-Agent': 'campus-movie-hunt/1.0 (build-time map bake)'},
  })
  if (res.status === 429 || res.status === 504) {
    if (attempt >= 4) throw new Error(`overpass ${res.status} after ${attempt} retries`)
    const backoff = 4000 * (attempt + 1)
    console.log(`  overpass ${res.status} — waiting ${backoff / 1000}s`)
    await wait(backoff)
    return overpass(q, attempt + 1)
  }
  if (!res.ok) throw new Error(`overpass ${res.status}`)
  await wait(1500)
  return (await res.json()) as {elements: unknown[]}
}

async function main(): Promise<void> {
  const bounds = await campusBounds()
  const lats = [bounds.s, bounds.n, ...LOCATIONS.map((l) => l.lat)]
  const lngs = [bounds.w, bounds.e, ...LOCATIONS.map((l) => l.lng)]
  const midLat = (Math.min(...lats) + Math.max(...lats)) / 2
  const mPerDegLat = 111_320
  const mPerDegLng = 111_320 * Math.cos((midLat * Math.PI) / 180)

  const south = Math.min(...lats) - PAD_M / mPerDegLat
  const north = Math.max(...lats) + PAD_M / mPerDegLat
  const west = Math.min(...lngs) - PAD_M / mPerDegLng
  const east = Math.max(...lngs) + PAD_M / mPerDegLng

  const widthM = (east - west) * mPerDegLng
  const heightM = (north - south) * mPerDegLat
  const outH = Math.round((OUT_W * heightM) / widthM)

  /** lat/lng → SVG space, y flipped so north is up. */
  const project = (lat: number, lng: number): [number, number] => [
    Math.round(((lng - west) / (east - west)) * OUT_W * 10) / 10,
    Math.round((1 - (lat - south) / (north - south)) * outH * 10) / 10,
  ]

  const q = `[out:json][timeout:90];(way["amenity"="college"](${south},${west},${north},${east});way["amenity"="university"](${south},${west},${north},${east});way["building"](${south},${west},${north},${east});way["highway"](${south},${west},${north},${east});way["natural"](${south},${west},${north},${east});way["landuse"](${south},${west},${north},${east});way["leisure"](${south},${west},${north},${east});way["waterway"](${south},${west},${north},${east}););out geom;`

  const body = (await overpass(q)) as {elements: Way[]}

  const features: Array<{kind: Kind; d: string; closed: boolean}> = []
  for (const w of body.elements) {
    const kind = w.tags ? classify(w.tags) : null
    if (!kind || !w.geometry || w.geometry.length < 2) continue
    const pts = w.geometry.map((g) => project(g.lat, g.lon))
    const first = pts[0]!
    const last = pts[pts.length - 1]!
    const closed = pts.length > 3 && first[0] === last[0] && first[1] === last[1]
    features.push({
      kind,
      d: `M${pts.map(([x, y]) => `${x} ${y}`).join('L')}${closed ? 'Z' : ''}`,
      closed,
    })
  }

  // Institutes OSM knows only as a point — SIDTM among them — have no shape to
  // draw. Carry them as labelled marks so a campus plan shows the institutes
  // on it, rather than roads and hostels with a hole where the teaching is.
  const nq = `[out:json][timeout:60];node["amenity"~"^(college|university)$"](${south},${west},${north},${east});out;`
  const nodes = (await overpass(nq)) as {
    elements: Array<{lat: number; lon: number; tags?: Record<string, string>}>
  }
  const landmarks = nodes.elements
    .filter((n) => n.tags?.name)
    .map((n) => {
      const [x, y] = project(n.lat, n.lon)
      return {name: n.tags!.name!, x, y}
    })

  const stops = LOCATIONS.map((l) => {
    const [x, y] = project(l.lat, l.lng)
    return {id: l.id, name: l.name, x, y}
  })

  const out = `/**
 * GENERATED — do not edit. Run \`npm run map\` to rebuild from the survey.
 *
 * Campus plan projected into a ${OUT_W}x${outH} box, north up.
 * Map data © OpenStreetMap contributors (ODbL).
 */

export interface MapFeature {
  kind: 'wood' | 'land' | 'water' | 'pitch' | 'building' | 'road' | 'campus'
  d: string
  closed: boolean
}

/** A place worth naming that OSM holds only as a point. */
export interface MapLandmark {
  name: string
  x: number
  y: number
}

export interface MapStop {
  id: string
  name: string
  x: number
  y: number
}

export const MAP_SIZE = {w: ${OUT_W}, h: ${outH}} as const
/** Metres across the plan, for a scale bar. */
export const MAP_WIDTH_M = ${Math.round(widthM)}
export const MAP_FEATURES: readonly MapFeature[] = ${JSON.stringify(features)}
export const MAP_LANDMARKS: readonly MapLandmark[] = ${JSON.stringify(landmarks)}
export const MAP_STOPS: readonly MapStop[] = ${JSON.stringify(stops, null, 2)}
`
  writeFileSync('client/src/lib/campus-map.ts', out)
  const counts = features.reduce<Record<string, number>>((a, s) => {
    a[s.kind] = (a[s.kind] ?? 0) + 1
    return a
  }, {})
  console.log(`plan ${OUT_W}x${outH} — ${Math.round(widthM)}x${Math.round(heightM)} m`)
  console.log('features:', counts)
  console.log('stops:', stops.length, ' landmarks:', landmarks.map((l) => l.name).join(', '))
}

await main()
