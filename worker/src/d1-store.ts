/**
 * D1-backed GameStore. All game rules live in @cmh/shared; this file is only
 * row <-> domain mapping. JSON-encoded columns (`stops`, `leg_par_ms`, `pool`,
 * `par_constants`, `payload`) are parsed here at the storage boundary.
 */

import type {
  Breadcrumb,
  GameEvent,
  GameStore,
  Player,
  Route,
  Session,
  Split,
  StoredBatch,
} from '@cmh/shared'

// SAFETY: every JSON column read here was written by this same store via
// JSON.stringify of the corresponding domain value, so the parsed shape is T.
const json = <T>(raw: string): T => JSON.parse(raw) as T

interface BatchRow {
  id: string
  name: string
  status: string
  created_at_ms: number
  route_pool_seed: string
  par_constants: string
  pool: string
}
interface PlayerRow {
  id: string
  batch_id: string
  name: string
  roster_id: string
  session_token: string
}
interface RouteRow {
  player_id: string
  stops: string
  par_total_ms: number
  leg_par_ms: string
}
interface SessionRow {
  player_id: string
  status: string
  start_ts_ms: number | null
  end_ts_ms: number | null
  current_level: number
  current_level_hints: number
  penalty_ms: number
  score_ms: number | null
}
interface SplitRow {
  player_id: string
  level: number
  location_id: string
  reached_ts_ms: number
  split_ms: number
  hints_used: number
  penalty_ms: number
}

const toBatch = (r: BatchRow): StoredBatch => ({
  id: r.id,
  name: r.name,
  // SAFETY: the `status` column is only ever written from BatchStatus values
  // by putBatch; no other writer touches this table.
  status: r.status as StoredBatch['status'],
  createdAtMs: r.created_at_ms,
  routePoolSeed: r.route_pool_seed,
  parConstants: json(r.par_constants),
  pool: json(r.pool),
})

const toPlayer = (r: PlayerRow): Player => ({
  id: r.id,
  batchId: r.batch_id,
  name: r.name,
  rosterId: r.roster_id,
  sessionToken: r.session_token,
})

const toRoute = (r: RouteRow): Route => ({
  playerId: r.player_id,
  stops: json(r.stops),
  parTotalMs: r.par_total_ms,
  legParMs: json(r.leg_par_ms),
})

const toSession = (r: SessionRow): Session => ({
  playerId: r.player_id,
  // SAFETY: the `status` column is only ever written from SessionStatus values
  // by putSession.
  status: r.status as Session['status'],
  startTsMs: r.start_ts_ms,
  endTsMs: r.end_ts_ms,
  currentLevel: r.current_level,
  currentLevelHints: r.current_level_hints,
  penaltyMs: r.penalty_ms,
  scoreMs: r.score_ms,
})

const toSplit = (r: SplitRow): Split => ({
  playerId: r.player_id,
  level: r.level,
  locationId: r.location_id,
  reachedTsMs: r.reached_ts_ms,
  splitMs: r.split_ms,
  hintsUsed: r.hints_used,
  penaltyMs: r.penalty_ms,
})

export class D1Store implements GameStore {
  constructor(private readonly db: D1Database) {}

  async putBatch(b: StoredBatch): Promise<void> {
    await this.db
      .prepare(
        `INSERT INTO batch (id, name, status, created_at_ms, route_pool_seed, par_constants, pool)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)
         ON CONFLICT(id) DO UPDATE SET
           name = ?2, status = ?3, par_constants = ?6, pool = ?7`,
      )
      .bind(
        b.id,
        b.name,
        b.status,
        b.createdAtMs,
        b.routePoolSeed,
        JSON.stringify(b.parConstants),
        JSON.stringify(b.pool),
      )
      .run()
  }

  async getBatch(id: string): Promise<StoredBatch | null> {
    const row = await this.db.prepare('SELECT * FROM batch WHERE id = ?1').bind(id).first<BatchRow>()
    return row ? toBatch(row) : null
  }

  async putPlayer(p: Player): Promise<void> {
    await this.db
      .prepare(
        `INSERT INTO player (id, batch_id, name, roster_id, session_token)
         VALUES (?1, ?2, ?3, ?4, ?5)
         ON CONFLICT(id) DO UPDATE SET name = ?3`,
      )
      .bind(p.id, p.batchId, p.name, p.rosterId, p.sessionToken)
      .run()
  }

  async getPlayer(id: string): Promise<Player | null> {
    const row = await this.db.prepare('SELECT * FROM player WHERE id = ?1').bind(id).first<PlayerRow>()
    return row ? toPlayer(row) : null
  }

  async getPlayerByToken(token: string): Promise<Player | null> {
    const row = await this.db
      .prepare('SELECT * FROM player WHERE session_token = ?1')
      .bind(token)
      .first<PlayerRow>()
    return row ? toPlayer(row) : null
  }

  async getPlayerByRoster(batchId: string, rosterId: string): Promise<Player | null> {
    const row = await this.db
      .prepare('SELECT * FROM player WHERE batch_id = ?1 AND roster_id = ?2')
      .bind(batchId, rosterId)
      .first<PlayerRow>()
    return row ? toPlayer(row) : null
  }

  async listPlayers(batchId: string): Promise<Player[]> {
    const {results} = await this.db
      .prepare('SELECT * FROM player WHERE batch_id = ?1')
      .bind(batchId)
      .all<PlayerRow>()
    return results.map(toPlayer)
  }

  async putRoute(r: Route): Promise<void> {
    await this.db
      .prepare(
        `INSERT INTO route (player_id, stops, par_total_ms, leg_par_ms)
         VALUES (?1, ?2, ?3, ?4)
         ON CONFLICT(player_id) DO UPDATE SET stops = ?2, par_total_ms = ?3, leg_par_ms = ?4`,
      )
      .bind(r.playerId, JSON.stringify(r.stops), r.parTotalMs, JSON.stringify(r.legParMs))
      .run()
  }

  async getRoute(playerId: string): Promise<Route | null> {
    const row = await this.db
      .prepare('SELECT * FROM route WHERE player_id = ?1')
      .bind(playerId)
      .first<RouteRow>()
    return row ? toRoute(row) : null
  }

  async assignedRouteKeys(batchId: string): Promise<Set<string>> {
    const {results} = await this.db
      .prepare(
        `SELECT r.stops AS stops FROM route r
         JOIN player p ON p.id = r.player_id
         WHERE p.batch_id = ?1`,
      )
      .bind(batchId)
      .all<{stops: string}>()
    return new Set(results.map((row) => json<string[]>(row.stops).join('>')))
  }

  async putSession(s: Session): Promise<void> {
    await this.db
      .prepare(
        `INSERT INTO session
           (player_id, status, start_ts_ms, end_ts_ms, current_level, current_level_hints, penalty_ms, score_ms)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)
         ON CONFLICT(player_id) DO UPDATE SET
           status = ?2, start_ts_ms = ?3, end_ts_ms = ?4, current_level = ?5,
           current_level_hints = ?6, penalty_ms = ?7, score_ms = ?8`,
      )
      .bind(
        s.playerId,
        s.status,
        s.startTsMs,
        s.endTsMs,
        s.currentLevel,
        s.currentLevelHints,
        s.penaltyMs,
        s.scoreMs,
      )
      .run()
  }

  async getSession(playerId: string): Promise<Session | null> {
    const row = await this.db
      .prepare('SELECT * FROM session WHERE player_id = ?1')
      .bind(playerId)
      .first<SessionRow>()
    return row ? toSession(row) : null
  }

  async listSessions(batchId: string): Promise<Session[]> {
    const {results} = await this.db
      .prepare(
        `SELECT s.* FROM session s
         JOIN player p ON p.id = s.player_id
         WHERE p.batch_id = ?1`,
      )
      .bind(batchId)
      .all<SessionRow>()
    return results.map(toSession)
  }

  async putSplit(s: Split): Promise<void> {
    await this.db
      .prepare(
        `INSERT INTO split
           (player_id, level, location_id, reached_ts_ms, split_ms, hints_used, penalty_ms)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)
         ON CONFLICT(player_id, level) DO UPDATE SET
           location_id = ?3, reached_ts_ms = ?4, split_ms = ?5, hints_used = ?6, penalty_ms = ?7`,
      )
      .bind(s.playerId, s.level, s.locationId, s.reachedTsMs, s.splitMs, s.hintsUsed, s.penaltyMs)
      .run()
  }

  async listSplits(playerId: string): Promise<Split[]> {
    const {results} = await this.db
      .prepare('SELECT * FROM split WHERE player_id = ?1 ORDER BY level')
      .bind(playerId)
      .all<SplitRow>()
    return results.map(toSplit)
  }

  async appendEvent(e: GameEvent): Promise<void> {
    await this.db
      .prepare('INSERT INTO game_event (player_id, type, ts_ms, payload) VALUES (?1, ?2, ?3, ?4)')
      .bind(e.playerId, e.type, e.tsMs, JSON.stringify(e.payload))
      .run()
  }

  async addBreadcrumbs(crumbs: readonly Breadcrumb[]): Promise<void> {
    if (crumbs.length === 0) return
    const stmt = this.db.prepare(
      'INSERT INTO breadcrumb (player_id, ts_ms, lat, lng, accuracy_m) VALUES (?1, ?2, ?3, ?4, ?5)',
    )
    await this.db.batch(
      crumbs.map((c) => stmt.bind(c.playerId, c.tsMs, c.lat, c.lng, c.accuracyM)),
    )
  }
}
