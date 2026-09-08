/**
 * Persistence boundary. The engine talks only to this interface; the Worker
 * provides a D1-backed implementation and tests use the in-memory one.
 */

import type {RoutePool} from './routes'
import type {
  Batch,
  Breadcrumb,
  GameEvent,
  Player,
  Route,
  Session,
  Split,
} from './types'

export type StoredBatch = Batch & {pool: RoutePool}

export interface GameStore {
  putBatch(batch: StoredBatch): Promise<void>
  getBatch(id: string): Promise<StoredBatch | null>
  /** Resolve the short signup code from the URL to its batch. */
  getBatchByCode(code: string): Promise<StoredBatch | null>
  /** Newest first. Organiser console only. */
  listBatches(): Promise<StoredBatch[]>

  putPlayer(player: Player): Promise<void>
  getPlayer(id: string): Promise<Player | null>
  getPlayerByToken(token: string): Promise<Player | null>
  getPlayerByRoster(batchId: string, rosterId: string): Promise<Player | null>
  setPlayerPassword(playerId: string, passwordHash: string): Promise<void>
  listPlayers(batchId: string): Promise<Player[]>

  putRoute(route: Route): Promise<void>
  getRoute(playerId: string): Promise<Route | null>
  /** Route keys (`stops.join('>')`) already assigned in a batch. */
  assignedRouteKeys(batchId: string): Promise<Set<string>>

  putSession(session: Session): Promise<void>
  getSession(playerId: string): Promise<Session | null>
  listSessions(batchId: string): Promise<Session[]>

  /** Every route in a batch. Reporting only. */
  listRoutes(batchId: string): Promise<Route[]>

  putSplit(split: Split): Promise<void>
  listSplits(playerId: string): Promise<Split[]>
  /** Every split in a batch. Reporting only. */
  listBatchSplits(batchId: string): Promise<Split[]>
  /** Drop a player's history — only when their route is being reissued. */
  clearSplits(playerId: string): Promise<void>

  appendEvent(event: GameEvent): Promise<void>
  /**
   * Every event in a batch, oldest first, capped. Reporting only.
   *
   * Capped because this is the one table with no natural ceiling — a long
   * event writes tens of thousands of rows, and a report is not worth an
   * unbounded read.
   */
  listEvents(batchId: string, limit: number): Promise<GameEvent[]>
  addBreadcrumbs(crumbs: readonly Breadcrumb[]): Promise<void>
}

// ---------------------------------------------------------------- in-memory

export class InMemoryStore implements GameStore {
  private batches = new Map<string, StoredBatch>()
  private players = new Map<string, Player>()
  private routes = new Map<string, Route>()
  private sessions = new Map<string, Session>()
  private splits: Split[] = []
  private events: GameEvent[] = []
  private crumbs: Breadcrumb[] = []

  async putBatch(batch: StoredBatch): Promise<void> {
    this.batches.set(batch.id, batch)
  }
  async getBatch(id: string): Promise<StoredBatch | null> {
    return this.batches.get(id) ?? null
  }
  async getBatchByCode(code: string): Promise<StoredBatch | null> {
    for (const b of this.batches.values()) if (b.eventCode === code) return b
    return null
  }
  async listBatches(): Promise<StoredBatch[]> {
    return [...this.batches.values()].sort((a, b) => b.createdAtMs - a.createdAtMs)
  }

  async putPlayer(player: Player): Promise<void> {
    this.players.set(player.id, player)
  }
  async getPlayer(id: string): Promise<Player | null> {
    return this.players.get(id) ?? null
  }
  async getPlayerByToken(token: string): Promise<Player | null> {
    for (const p of this.players.values()) if (p.sessionToken === token) return p
    return null
  }
  async getPlayerByRoster(batchId: string, rosterId: string): Promise<Player | null> {
    for (const p of this.players.values()) {
      if (p.batchId === batchId && p.rosterId === rosterId) return p
    }
    return null
  }
  async setPlayerPassword(playerId: string, passwordHash: string): Promise<void> {
    const p = this.players.get(playerId)
    if (p) this.players.set(playerId, {...p, passwordHash})
  }
  async listPlayers(batchId: string): Promise<Player[]> {
    return [...this.players.values()].filter((p) => p.batchId === batchId)
  }

  async putRoute(route: Route): Promise<void> {
    this.routes.set(route.playerId, route)
  }
  async getRoute(playerId: string): Promise<Route | null> {
    return this.routes.get(playerId) ?? null
  }
  async assignedRouteKeys(batchId: string): Promise<Set<string>> {
    const players = new Set([...this.players.values()].filter((p) => p.batchId === batchId).map((p) => p.id))
    const keys = new Set<string>()
    for (const r of this.routes.values()) {
      if (players.has(r.playerId)) keys.add(r.stops.join('>'))
    }
    return keys
  }

  async putSession(session: Session): Promise<void> {
    this.sessions.set(session.playerId, session)
  }
  async getSession(playerId: string): Promise<Session | null> {
    return this.sessions.get(playerId) ?? null
  }
  async listSessions(batchId: string): Promise<Session[]> {
    const ids = new Set((await this.listPlayers(batchId)).map((p) => p.id))
    return [...this.sessions.values()].filter((s) => ids.has(s.playerId))
  }

  async putSplit(split: Split): Promise<void> {
    this.splits = this.splits.filter(
      (s) => !(s.playerId === split.playerId && s.level === split.level),
    )
    this.splits.push(split)
  }
  async listRoutes(batchId: string): Promise<Route[]> {
    const ids = new Set(
      [...this.players.values()].filter((p) => p.batchId === batchId).map((p) => p.id),
    )
    return [...this.routes.values()].filter((r) => ids.has(r.playerId))
  }
  async listBatchSplits(batchId: string): Promise<Split[]> {
    const ids = new Set(
      [...this.players.values()].filter((p) => p.batchId === batchId).map((p) => p.id),
    )
    return this.splits.filter((s) => ids.has(s.playerId))
  }
  async listSplits(playerId: string): Promise<Split[]> {
    return this.splits
      .filter((s) => s.playerId === playerId)
      .sort((a, b) => a.level - b.level)
  }
  async clearSplits(playerId: string): Promise<void> {
    this.splits = this.splits.filter((s) => s.playerId !== playerId)
  }

  async appendEvent(event: GameEvent): Promise<void> {
    this.events.push(event)
  }
  async listEvents(batchId: string, limit: number): Promise<GameEvent[]> {
    const ids = new Set(
      [...this.players.values()].filter((p) => p.batchId === batchId).map((p) => p.id),
    )
    return this.events
      .filter((e) => ids.has(e.playerId))
      .sort((a, b) => a.tsMs - b.tsMs)
      .slice(0, limit)
  }
  async addBreadcrumbs(crumbs: readonly Breadcrumb[]): Promise<void> {
    this.crumbs.push(...crumbs)
  }

  /** Test-only inspection. */
  allEvents(): readonly GameEvent[] {
    return this.events
  }
  allBreadcrumbs(): readonly Breadcrumb[] {
    return this.crumbs
  }
}
