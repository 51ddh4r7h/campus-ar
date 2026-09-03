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

const Handle = v.pipe(v.string(), v.trim(), v.minLength(1), v.maxLength(40))
const DisplayName = v.pipe(v.string(), v.trim(), v.minLength(1), v.maxLength(60))
const Password = v.pipe(v.string(), v.minLength(6), v.maxLength(200))

const CreateBatchSchema = v.object({
  name: NonEmpty,
  demo: v.optional(v.boolean(), false),
  eventCode: v.optional(v.pipe(v.string(), v.trim(), v.maxLength(40))),
})

const SignupSchema = v.object({
  eventCode: Handle,
  username: Handle,
  name: DisplayName,
  password: Password,
})

const LoginSchema = v.object({
  eventCode: Handle,
  username: Handle,
  password: v.pipe(v.string(), v.minLength(1), v.maxLength(200)),
})

/** A practice run may pin its route; everything else is server-chosen. */
const DemoSessionSchema = v.object({
  route: v.optional(v.pipe(v.array(NonEmpty), v.length(5))),
})

const RegisterPlayersSchema = v.object({
  players: v.pipe(
    v.array(
      v.object({
        name: NonEmpty,
        rosterId: NonEmpty,
        /** Demo/testing: pin an exact 5-stop route. */
        route: v.optional(v.pipe(v.array(NonEmpty), v.length(5))),
      }),
    ),
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

export const parseCreateBatch = (raw: unknown): v.InferOutput<typeof CreateBatchSchema> =>
  parse(CreateBatchSchema, raw)

export const parseDemoSession = (raw: unknown): {route?: string[] | undefined} =>
  parse(DemoSessionSchema, raw)

export const parseRegisterPlayers = (
  raw: unknown,
): {players: ReadonlyArray<{name: string; rosterId: string; route?: string[] | undefined}>} =>
  parse(RegisterPlayersSchema, raw)

export const parseSignup = (raw: unknown): v.InferOutput<typeof SignupSchema> =>
  parse(SignupSchema, raw)

export const parseLogin = (raw: unknown): v.InferOutput<typeof LoginSchema> => parse(LoginSchema, raw)

export const parseSamples = (raw: unknown): GeoSample[] => parse(SamplesSchema, raw).samples

export const parseHintRung = (raw: unknown): HintRung => parse(HintSchema, raw).rung

export const parseCrumbs = (
  raw: unknown,
): {crumbs: ReadonlyArray<{lat: number; lng: number; accuracyM: number; tsMs: number}>} =>
  parse(CrumbsSchema, raw)
