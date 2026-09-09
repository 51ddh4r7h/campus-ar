/**
 * Request-body schemas at the HTTP boundary. Valibot turns untrusted JSON into
 * named domain shapes; the engine downstream only ever sees validated values.
 */

import * as v from 'valibot'
import {optionValues, type Feedback, type GeoSample, type HintRung} from '@cmh/shared'

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

/** One of three words, or absent. Anything else is simply not recorded. */
const Device = v.optional(v.picklist(['ios', 'android', 'other'] as const))

const SignupSchema = v.object({
  eventCode: Handle,
  username: Handle,
  name: DisplayName,
  password: Password,
  device: Device,
})

const LoginSchema = v.object({
  eventCode: Handle,
  username: Handle,
  password: v.pipe(v.string(), v.minLength(1), v.maxLength(200)),
  device: Device,
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

/** One of the answers the shared SURVEY defines for that question, nothing else. */
const answerFor = (id: string): v.GenericSchema<string> => {
  const values = optionValues(id)
  // SAFETY: optionValues throws on an unknown id, and every SURVEY question is
  // defined with at least two options — so this is always a non-empty tuple,
  // which is the shape v.picklist's type wants.
  return v.picklist(values as [string, ...string[]])
}
const FeedbackSchema = v.object({
  stars: v.pipe(v.number(), v.integer(), v.minValue(1), v.maxValue(5)),
  clues: answerFor('clues'),
  navigation: answerFor('navigation'),
  friction: answerFor('friction'),
  recommend: answerFor('recommend'),
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

export const parseFeedback = (raw: unknown): Feedback => parse(FeedbackSchema, raw)
