/**
 * The post-game survey.
 *
 * One place defines the questions, their wording and their allowed answers, so
 * the client renders it, the Worker validates against it and the analytics
 * bucket by it from the same list. Every answer is a pick from a fixed set —
 * nobody types anything — which is what lets the results be aggregated at all.
 *
 * Add or reword a question here and the whole path follows. Changing an
 * option's `value` after a cohort has answered orphans their responses, so
 * treat the values as frozen once a real event has run.
 */

export interface SurveyOption {
  /** Stored verbatim in the event payload — keep short and stable. */
  value: string
  label: string
}

export interface SurveyQuestion {
  id: string
  prompt: string
  options: readonly SurveyOption[]
}

export const SURVEY: readonly SurveyQuestion[] = [
  {
    id: 'clues',
    prompt: 'Working out where the clips were filmed was…',
    options: [
      {value: 'hard', label: 'Too hard'},
      {value: 'tricky', label: 'A bit tricky'},
      {value: 'right', label: 'About right'},
      {value: 'easy', label: 'Too easy'},
    ],
  },
  {
    id: 'navigation',
    prompt: 'Walking to the places, I felt…',
    options: [
      {value: 'lost', label: 'Lost most of the time'},
      {value: 'unsure', label: 'Unsure at times'},
      {value: 'confident', label: 'Confident'},
    ],
  },
  {
    id: 'friction',
    prompt: 'What got in the way most?',
    options: [
      {value: 'none', label: 'Nothing really'},
      {value: 'gps', label: 'GPS / location accuracy'},
      {value: 'clues', label: 'Understanding the clues'},
      {value: 'ar', label: 'The camera or AR reveal'},
      {value: 'time', label: 'Not enough time'},
    ],
  },
  {
    id: 'recommend',
    prompt: 'Would you tell a friend to play?',
    options: [
      {value: 'no', label: 'Probably not'},
      {value: 'maybe', label: 'Maybe'},
      {value: 'yes', label: 'Definitely'},
    ],
  },
] as const

/** The full response: a star rating plus one answer per survey question. */
export interface Feedback {
  /** 1–5. */
  stars: number
  clues: string
  navigation: string
  friction: string
  recommend: string
}

export const SURVEY_IDS = SURVEY.map((q) => q.id)

/** The allowed answer values for a question, for building a validator. */
export const optionValues = (id: string): readonly string[] => {
  const q = SURVEY.find((s) => s.id === id)
  if (!q) throw new Error(`feedback: no survey question "${id}"`)
  return q.options.map((o) => o.value)
}

/** Human label for a stored value, e.g. on the dashboard. */
export const optionLabel = (id: string, value: string): string =>
  SURVEY.find((s) => s.id === id)?.options.find((o) => o.value === value)?.label ?? value
