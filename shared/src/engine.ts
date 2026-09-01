/**
 * The game engine. Pure orchestration over a GameStore: session lifecycle,
 * strict level progression, arrival validation, hint gating, par scoring and
 * standings. No HTTP, no storage details, no time or randomness of its own —
 * those come in through `deps` so tests are deterministic.
 */

import {
  DEFAULT_PAR_CONSTANTS,
  HINT_GATES,
  LEVEL_COUNT,
} from './config'
import {LAYOUT, LOCATIONS, START_POINT, locationById} from './content'
import {generateRoutePool} from './routes'
import {assignRoute} from './routes'
import {routePar, sessionScoreMs} from './scoring'
import {VALIDATION} from './config'
import {haversineM} from './geo'
import {bandFromHeat, heatFromDistance} from './heat'
import {evaluateArrival} from './validation'
import type {ArrivalOutcome} from './validation'
import type {GameStore, StoredBatch} from './store'
import type {
  ClueView,
  GameEvent,
  GameEventType,
  GameLocation,
  GeoSample,
  HintRung,
  ParConstants,
  Player,
  Route,
  Session,
  Split,
  StandingRow,
  StartHuntResponse,
  ValidationFailure,
  ValidationResult,
} from './types'

export type EngineErrorCode =
  | 'batch_not_found'
  | 'bad_token'
  | 'already_started'
  | 'not_in_progress'
  | 'hint_locked'
  | 'pool_empty'

export class EngineError extends Error {
  constructor(readonly code: EngineErrorCode, message?: string) {
    super(message ?? code)
    this.name = 'EngineError'
  }
}

export interface EngineDeps {
  now(): number
  randomId(): string
  randomToken(): string
}

const HINT_ORDER: readonly HintRung[] = ['warm', 'close', 'showLocation']

/** Sum of the first `count` hint-rung penalties, in ms. */
const hintPenaltyForCount = (count: number, pc: ParConstants): number => {
  let total = 0
  for (let i = 0; i < count && i < HINT_ORDER.length; i++) {
    total += pc.hintPenaltyMs[HINT_ORDER[i]!]
  }
  return total
}

/** An arrival that actually landed, with its timestamp narrowed to a number. */
type ReachedOutcome = ArrivalOutcome & {reachedTsMs: number}

const reached = (o: ArrivalOutcome): o is ReachedOutcome => o.ok && o.reachedTsMs !== null

/** An arrival the server refused. The clock keeps running; nothing is written. */
const rejectArrival = (
  session: Session,
  failure: ValidationFailure | null,
  nextClue: ClueView | null,
): ValidationResult => ({ok: false, failure, session, split: null, reveal: null, nextClue})

/** Move the player on to the next level, or close out the hunt on the last one. */
const advanceSession = (session: Session, route: Route, reachedTsMs: number): Session => {
  const nextLevel = session.currentLevel + 1
  const complete = nextLevel > LEVEL_COUNT
  const elapsedMs = reachedTsMs - (session.startTsMs ?? reachedTsMs)
  return {
    ...session,
    currentLevel: nextLevel,
    currentLevelHints: 0,
    currentLevelViews: 0,
    status: complete ? 'complete' : 'in_progress',
    endTsMs: complete ? reachedTsMs : null,
    scoreMs: complete ? sessionScoreMs(elapsedMs, session.penaltyMs, route.parTotalMs) : null,
  }
}

/** The reward payload for a level just completed. */
const revealView = (target: GameLocation, split: Split, huntComplete: boolean) => ({
  level: split.level,
  locationName: target.name,
  movie: target.movie,
  campusFact: target.campusFact,
  clipUrl: target.clipUrl,
  posterUrl: target.posterUrl,
  splitMs: split.splitMs,
  penaltyMs: split.penaltyMs,
  huntComplete,
})

export interface CreateBatchInput {
  name: string
  parConstants?: ParConstants
  isDemo?: boolean
}

export interface RegisterPlayerInput {
  batchId: string
  name: string
  rosterId: string
  /** Pin an exact route (5 distinct location ids) instead of drawing from the
   *  balanced pool. Demo / testing only. */
  pinnedRoute?: readonly string[]
}

export const createEngine = (store: GameStore, deps: EngineDeps) => {
  const event = (
    playerId: string,
    type: GameEventType,
    payload: GameEvent['payload'] = {},
  ): Promise<void> =>
    store.appendEvent({playerId, type, tsMs: deps.now(), payload})

  const resolveStops = (route: Route): GameLocation[] =>
    route.stops.map((id) => {
      const loc = locationById(id)
      if (!loc) throw new Error(`engine: unknown location "${id}" in route`)
      return loc
    })

  const clueView = (route: Route, session: Session): ClueView => {
    const level = session.currentLevel
    const loc = resolveStops(route)[level - 1]!
    const hints = session.currentLevelHints
    return {
      level,
      clipUrl: loc.clipUrl,
      posterUrl: loc.posterUrl,
      sceneRefImage: loc.sceneRefImage,
      clueText: {
        far: loc.clue.far,
        warm: hints >= 1 ? loc.clue.warm : null,
        close: hints >= 2 ? loc.clue.close : null,
      },
      radiusHintM: loc.radiusM,
      revealPoint: hints >= 3 ? {lat: loc.lat, lng: loc.lng} : null,
    }
  }

  const prevReachedTs = (session: Session, splits: readonly Split[]): number => {
    if (session.currentLevel <= 1) return session.startTsMs ?? deps.now()
    const prior = splits.find((s) => s.level === session.currentLevel - 1)
    return prior?.reachedTsMs ?? session.startTsMs ?? deps.now()
  }

  /** Persist the split for the level just finished, and its telemetry. */
  const recordSplit = async (
    session: Session,
    target: GameLocation,
    outcome: ReachedOutcome,
    prevTsMs: number,
    pc: ParConstants,
  ): Promise<Split> => {
    const split: Split = {
      playerId: session.playerId,
      level: session.currentLevel,
      locationId: target.id,
      reachedTsMs: outcome.reachedTsMs,
      splitMs: outcome.reachedTsMs - prevTsMs,
      hintsUsed: session.currentLevelHints,
      penaltyMs: hintPenaltyForCount(session.currentLevelHints, pc),
    }
    await store.putSplit(split)
    await event(session.playerId, 'location_reached', {
      level: split.level,
      splitMs: split.splitMs,
    })
    if (outcome.flagged) {
      await event(session.playerId, 'speed_flag', {level: split.level})
    }
    return split
  }

  async function authed(token: string): Promise<{
    player: Player
    session: Session
    route: Route
    batch: StoredBatch
  }> {
    const player = await store.getPlayerByToken(token)
    if (!player) throw new EngineError('bad_token')
    const [session, route, batch] = await Promise.all([
      store.getSession(player.id),
      store.getRoute(player.id),
      store.getBatch(player.batchId),
    ])
    if (!session || !route || !batch) throw new EngineError('bad_token')
    return {player, session, route, batch}
  }

  return {
    async createBatch(input: CreateBatchInput): Promise<StoredBatch> {
      const pc = input.parConstants ?? DEFAULT_PAR_CONSTANTS
      const id = deps.randomId()
      const seed = deps.randomId()
      const pool = generateRoutePool(LOCATIONS, START_POINT, pc, seed)
      if (pool.routes.length === 0) throw new EngineError('pool_empty')
      const batch: StoredBatch = {
        id,
        name: input.name,
        status: 'open',
        createdAtMs: deps.now(),
        routePoolSeed: seed,
        parConstants: pc,
        isDemo: input.isDemo ?? false,
        pool,
      }
      await store.putBatch(batch)
      return batch
    },

    async registerPlayer(
      input: RegisterPlayerInput,
    ): Promise<{player: Player; session: Session}> {
      const batch = await store.getBatch(input.batchId)
      if (!batch) throw new EngineError('batch_not_found')

      const existing = await store.getPlayerByRoster(input.batchId, input.rosterId)
      if (existing) {
        const session = await store.getSession(existing.id)
        if (session) return {player: existing, session}
      }

      const player: Player = {
        id: deps.randomId(),
        batchId: input.batchId,
        name: input.name,
        rosterId: input.rosterId,
        sessionToken: deps.randomToken(),
      }

      let stops: Route['stops']
      let parTotalMs: number
      let legParMs: Route['legParMs']
      if (input.pinnedRoute) {
        const pinned = input.pinnedRoute
        const locs = pinned.map((id) => locationById(id))
        if (pinned.length !== LEVEL_COUNT || new Set(pinned).size !== LEVEL_COUNT || locs.some((l) => !l)) {
          throw new EngineError('pool_empty', 'pinnedRoute must be 5 distinct known location ids')
        }
        // SAFETY: the guard above proved every entry resolves and the length is 5.
        const resolved = locs as GameLocation[]
        const par = routePar(resolved, START_POINT, batch.parConstants)
        stops = [pinned[0]!, pinned[1]!, pinned[2]!, pinned[3]!, pinned[4]!]
        parTotalMs = par.totalMs
        legParMs = par.legMs
      } else {
        const assigned = await store.assignedRouteKeys(input.batchId)
        const tmpl = assignRoute(batch.pool, assigned)
        stops = tmpl.stops
        parTotalMs = tmpl.parTotalMs
        legParMs = tmpl.legParMs
      }
      const route: Route = {playerId: player.id, stops, parTotalMs, legParMs}
      const session: Session = {
        playerId: player.id,
        status: 'not_started',
        startTsMs: null,
        endTsMs: null,
        currentLevel: 1,
        currentLevelHints: 0,
        currentLevelViews: 0,
        penaltyMs: 0,
        scoreMs: null,
      }
      await store.putPlayer(player)
      await store.putRoute(route)
      await store.putSession(session)
      return {player, session}
    },

    async startHunt(token: string): Promise<StartHuntResponse> {
      const {session, route} = await authed(token)
      if (session.status === 'in_progress') {
        return {session, clue: clueView(route, session)}
      }
      if (session.status !== 'not_started') throw new EngineError('already_started')

      const started: Session = {
        ...session,
        status: 'in_progress',
        startTsMs: deps.now(),
        currentLevel: 1,
        currentLevelHints: 0,
        currentLevelViews: 0,
      }
      await store.putSession(started)
      await event(started.playerId, 'hunt_started')
      const clue = clueView(route, started)
      await event(started.playerId, 'clue_served', {level: clue.level})
      return {session: started, clue}
    },

    async getState(token: string): Promise<{
      session: Session
      clue: ClueView | null
      splits: Split[]
    }> {
      const {session, route} = await authed(token)
      const splits = await store.listSplits(session.playerId)
      const clue =
        session.status === 'in_progress' ? clueView(route, session) : null
      return {session, clue, splits}
    },

    async nearby(
      token: string,
      samples: readonly GeoSample[],
    ): Promise<import('./types').NearbyResult> {
      const {session, route} = await authed(token)
      if (session.status !== 'in_progress') {
        return {
          atTarget: false,
          dwellMs: 0,
          dwellNeededMs: VALIDATION.dwellMs,
          signalOk: true,
          heat: 0,
          band: 0,
          failure: 'not_in_progress',
        }
      }
      const stops = resolveStops(route)
      const target = stops[session.currentLevel - 1]!
      const splits = await store.listSplits(session.playerId)
      const outcome = evaluateArrival({
        routeStops: stops,
        currentLevel: session.currentLevel,
        prevReachedTsMs: prevReachedTs(session, splits),
        samples,
        nowMs: deps.now(),
      })

      // Warmth from the closest fresh, trustworthy fix. Never a coordinate.
      const now = deps.now()
      const dists = samples
        .filter((s) => now - s.tsMs <= VALIDATION.maxFixAgeMs && (s.simulated || s.accuracyM <= LAYOUT.maxAccuracyM))
        .map((s) => haversineM(s, target))
      const heat = dists.length > 0 ? heatFromDistance(Math.min(...dists), target.radiusM) : 0

      const atRadius =
        outcome.ok || outcome.failure === 'dwell' || outcome.failure === 'too_fast'
      return {
        atTarget: atRadius,
        dwellMs: outcome.insideMs,
        dwellNeededMs: VALIDATION.dwellMs,
        signalOk: outcome.failure !== 'signal',
        heat: Math.round(heat),
        band: bandFromHeat(heat),
        failure: outcome.ok ? null : outcome.failure,
      }
    },

    async arrive(token: string, samples: readonly GeoSample[]): Promise<ValidationResult> {
      const {session, route, batch} = await authed(token)
      if (session.status !== 'in_progress') {
        return rejectArrival(session, 'not_in_progress', null)
      }

      const stops = resolveStops(route)
      const splits = await store.listSplits(session.playerId)
      const prev = prevReachedTs(session, splits)

      const outcome = evaluateArrival({
        routeStops: stops,
        currentLevel: session.currentLevel,
        prevReachedTsMs: prev,
        samples,
        nowMs: deps.now(),
      })

      if (!reached(outcome)) {
        if (outcome.failure === 'level_locked') {
          await event(session.playerId, 'skip_attempt', {level: session.currentLevel})
        }
        return rejectArrival(session, outcome.failure, clueView(route, session))
      }

      const target = stops[session.currentLevel - 1]!
      const split = await recordSplit(session, target, outcome, prev, batch.parConstants)
      const next = advanceSession(session, route, outcome.reachedTsMs)
      const complete = next.status === 'complete'

      await store.putSession(next)
      if (complete) {
        await event(session.playerId, 'hunt_completed', {scoreMs: next.scoreMs ?? 0})
      }

      return {
        ok: true,
        failure: null,
        session: next,
        split,
        reveal: revealView(target, split, complete),
        nextClue: complete ? null : clueView(route, next),
      }
    },

    /**
     * The player watched the scene again.
     *
     * Two viewings a level are free; past that each one costs, the same way a
     * hint does. The clip is the clue, so unlimited rewatching would make
     * recognising a place optional — you could simply stare until the answer
     * arrived. Counted on the server because it moves the score.
     */
    async viewScene(token: string): Promise<{penaltyMs: number; session: Session}> {
      const {session, batch} = await authed(token)
      if (session.status !== 'in_progress') throw new EngineError('not_in_progress')

      const used = session.currentLevelViews
      const penaltyMs = used < batch.parConstants.freeViews ? 0 : batch.parConstants.viewPenaltyMs
      const next: Session = {
        ...session,
        currentLevelViews: used + 1,
        penaltyMs: session.penaltyMs + penaltyMs,
      }
      await store.putSession(next)
      if (penaltyMs > 0) {
        await event(session.playerId, 'view_charged', {level: next.currentLevel, penaltyMs})
      }
      return {penaltyMs, session: next}
    },

    async useHint(
      token: string,
      rung: HintRung,
    ): Promise<{clue: ClueView; penaltyMs: number; session: Session}> {
      const {session, route, batch} = await authed(token)
      if (session.status !== 'in_progress') throw new EngineError('not_in_progress')

      const rungIndex = HINT_ORDER.indexOf(rung)
      if (rungIndex !== session.currentLevelHints) throw new EngineError('hint_locked')

      const splits = await store.listSplits(session.playerId)
      const onLevelForMs = deps.now() - prevReachedTs(session, splits)
      const gate =
        rung === 'warm'
          ? HINT_GATES.warmAfterMs
          : rung === 'close'
            ? HINT_GATES.closeAfterMs
            : HINT_GATES.showLocationAfterMs
      if (onLevelForMs < gate) throw new EngineError('hint_locked')

      const penaltyMs = batch.parConstants.hintPenaltyMs[rung]
      const next: Session = {
        ...session,
        currentLevelHints: session.currentLevelHints + 1,
        penaltyMs: session.penaltyMs + penaltyMs,
      }
      await store.putSession(next)
      await event(session.playerId, 'hint_used', {level: next.currentLevel, rung})
      return {clue: clueView(route, next), penaltyMs, session: next}
    },

    async addBreadcrumbs(
      token: string,
      crumbs: ReadonlyArray<{lat: number; lng: number; accuracyM: number; tsMs: number}>,
    ): Promise<void> {
      const {player} = await authed(token)
      await store.addBreadcrumbs(crumbs.map((c) => ({playerId: player.id, ...c})))
    },

    async standings(batchId: string, selfPlayerId?: string): Promise<StandingRow[]> {
      const [players, sessions] = await Promise.all([
        store.listPlayers(batchId),
        store.listSessions(batchId),
      ])
      const nameById = new Map(players.map((p) => [p.id, p.name]))
      const sorted = sessions
        .filter((s) => s.status === 'complete' || s.status === 'in_progress')
        .sort((a, b) => {
          const aDone = a.status === 'complete'
          const bDone = b.status === 'complete'
          if (aDone && bDone) return (a.scoreMs ?? 0) - (b.scoreMs ?? 0)
          if (aDone) return -1
          if (bDone) return 1
          return b.currentLevel - a.currentLevel
        })
      return sorted.map((s, i) => ({
        rank: i + 1,
        playerName: nameById.get(s.playerId) ?? '—',
        isSelf: s.playerId === selfPlayerId,
        scoreMs: s.status === 'complete' ? s.scoreMs : null,
        level: s.status === 'complete' ? null : s.currentLevel,
      }))
    },
  }
}

export type GameEngine = ReturnType<typeof createEngine>
