/**
 * Request-body schemas at the HTTP boundary. Valibot turns untrusted JSON into
 * named domain shapes; the engine downstream only ever sees validated values.
 */

import * as v from 'valibot'
import type {GeoSample, HintRung} from '@cmh/shared'

export class BadInput extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'BadInput'
  }
}

const NonEmpty = v.pipe(v.string(), v.minLength(1))
const Finite = v.pipe(v.number(), v.finite())

const CreateBatchSchema = v.object({name: NonEmpty})

const RegisterPlayersSchema = v.object({
  players: v.pipe(
    v.array(v.object({name: NonEmpty, rosterId: NonEmpty})),
    v.minLength(1),
    v.maxLength(200),
  ),
})

const SampleSchema = v.object({
  lat: Finite,
  lng: Finite,
  accuracyM: Finite,
  tsMs: Finite,
  simulated: v.optional(v.boolean(), false),
})
const SamplesSchema = v.object({
  samples: v.pipe(v.array(SampleSchema), v.maxLength(240)),
})

const HintSchema = v.object({
  rung: v.picklist(['warm', 'close', 'showLocation'] satisfies HintRung[]),
})

const CrumbSchema = v.object({lat: Finite, lng: Finite, accuracyM: Finite, tsMs: Finite})
const CrumbsSchema = v.object({
  crumbs: v.pipe(v.array(CrumbSchema), v.maxLength(500)),
})

const parse = <TSchema extends v.GenericSchema>(
  schema: TSchema,
  raw: unknown,
): v.InferOutput<TSchema> => {
  const result = v.safeParse(schema, raw)
  if (!result.success) {
    throw new BadInput(result.issues.map((i) => `${v.getDotPath(i) ?? 'body'}: ${i.message}`).join('; '))
  }
  return result.output
}

export const parseCreateBatch = (raw: unknown): {name: string} => parse(CreateBatchSchema, raw)

export const parseRegisterPlayers = (
  raw: unknown,
): {players: ReadonlyArray<{name: string; rosterId: string}>} => parse(RegisterPlayersSchema, raw)

export const parseSamples = (raw: unknown): GeoSample[] => parse(SamplesSchema, raw).samples

export const parseHintRung = (raw: unknown): HintRung => parse(HintSchema, raw).rung

export const parseCrumbs = (
  raw: unknown,
): {crumbs: ReadonlyArray<{lat: number; lng: number; accuracyM: number; tsMs: number}>} =>
  parse(CrumbsSchema, raw)
