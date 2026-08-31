/** Pure helpers for the rolling GPS sample buffer. */

import type {GeoSample} from '@cmh/shared'

/** Drop samples older than `maxAgeMs`; returns a new array. */
export const trimBuffer = (
  samples: readonly GeoSample[],
  nowMs: number,
  maxAgeMs: number,
): GeoSample[] => samples.filter((s) => nowMs - s.tsMs <= maxAgeMs)

/** The window handed to an arrival check — the freshest slice. */
export const recentSamples = (
  samples: readonly GeoSample[],
  nowMs: number,
  windowMs = 30_000,
): GeoSample[] => samples.filter((s) => s.tsMs >= nowMs - windowMs)
