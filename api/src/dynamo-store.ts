/**
 * DynamoDB-backed GameStore. Single table, keys `pk`/`sk`, one GSI `gsi1`
 * (`gsi1pk`/`gsi1sk`) used to list a batch's players and sessions.
 *
 * Every item stores its exact domain object under `data`; the engine's rules
 * live entirely in @cmh/shared, so this file is only key layout + I/O.
 *
 *   batch    pk=BATCH#<id>      sk=META
 *   player   pk=PLAYER#<id>     sk=PROFILE   gsi1pk=BATCH#<b> gsi1sk=PLAYER#<id>
 *   token    pk=TOKEN#<token>   sk=T                      (→ { playerId })
 *   route    pk=PLAYER#<id>     sk=ROUTE
 *   session  pk=PLAYER#<id>     sk=SESSION   gsi1pk=BATCH#<b> gsi1sk=SESSION#<id>
 *   split    pk=PLAYER#<id>     sk=SPLIT#<0004>
 *   event    pk=PLAYER#<id>     sk=EVENT#<ts>#<rand>
 *   crumb    pk=PLAYER#<id>     sk=CRUMB#<ts>#<rand>
 */

import {DynamoDBClient} from '@aws-sdk/client-dynamodb'
import {
  BatchWriteCommand,
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  QueryCommand,
} from '@aws-sdk/lib-dynamodb'
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

interface ItemKey {
  pk: string
  sk: string
}
interface Gsi1 {
  gsi1pk: string
  gsi1sk: string
}
interface StoredItem extends ItemKey {
  data?: unknown
}

// SAFETY: every `data` attribute read here was written by this same store from
// the matching domain value, so the recorded shape is T.
const readData = <T>(item: StoredItem | undefined): T | null =>
  item ? (item.data as T) : null

const batchKey = (id: string): ItemKey => ({pk: `BATCH#${id}`, sk: 'META'})
const playerKey = (id: string): ItemKey => ({pk: `PLAYER#${id}`, sk: 'PROFILE'})
const level4 = (n: number): string => String(n).padStart(4, '0')

export class DynamoStore implements GameStore {
  private readonly doc: DynamoDBDocumentClient

  constructor(private readonly table: string, region?: string) {
    this.doc = DynamoDBDocumentClient.from(
      new DynamoDBClient(region ? {region} : {}),
      {marshallOptions: {removeUndefinedValues: true}},
    )
  }

  private async put<T>(key: ItemKey, data: T, gsi?: Gsi1): Promise<void> {
    await this.doc.send(
      new PutCommand({TableName: this.table, Item: {...key, ...gsi, data}}),
    )
  }

  private async get<T>(pk: string, sk: string): Promise<T | null> {
    const res = await this.doc.send(
      new GetCommand({TableName: this.table, Key: {pk, sk}}),
    )
    // SAFETY: every item this store writes carries `pk`, `sk` and `data`.
    return readData<T>(res.Item as StoredItem | undefined)
  }

  private async queryData<T>(
    gsi1pk: string,
    skPrefix: string,
  ): Promise<T[]> {
    const res = await this.doc.send(
      new QueryCommand({
        TableName: this.table,
        IndexName: 'gsi1',
        KeyConditionExpression: 'gsi1pk = :p AND begins_with(gsi1sk, :s)',
        ExpressionAttributeValues: {':p': gsi1pk, ':s': skPrefix},
      }),
    )
    // SAFETY: gsi1 only carries player and session items, written with `data`.
    return (res.Items ?? []).map((i) => i.data as T)
  }

  async putBatch(b: StoredBatch): Promise<void> {
    await this.put(batchKey(b.id), b)
  }
  async getBatch(id: string): Promise<StoredBatch | null> {
    return this.get<StoredBatch>(`BATCH#${id}`, 'META')
  }

  async putPlayer(p: Player): Promise<void> {
    await Promise.all([
      this.put(playerKey(p.id), p, {gsi1pk: `BATCH#${p.batchId}`, gsi1sk: `PLAYER#${p.id}`}),
      this.put({pk: `TOKEN#${p.sessionToken}`, sk: 'T'}, {playerId: p.id}),
    ])
  }
  async getPlayer(id: string): Promise<Player | null> {
    return this.get<Player>(`PLAYER#${id}`, 'PROFILE')
  }
  async getPlayerByToken(token: string): Promise<Player | null> {
    const ref = await this.get<{playerId: string}>(`TOKEN#${token}`, 'T')
    return ref ? this.getPlayer(ref.playerId) : null
  }
  async getPlayerByRoster(batchId: string, rosterId: string): Promise<Player | null> {
    const players = await this.listPlayers(batchId)
    return players.find((p) => p.rosterId === rosterId) ?? null
  }
  async listPlayers(batchId: string): Promise<Player[]> {
    return this.queryData<Player>(`BATCH#${batchId}`, 'PLAYER#')
  }

  async putRoute(r: Route): Promise<void> {
    await this.put({pk: `PLAYER#${r.playerId}`, sk: 'ROUTE'}, r)
  }
  async getRoute(playerId: string): Promise<Route | null> {
    return this.get<Route>(`PLAYER#${playerId}`, 'ROUTE')
  }
  async assignedRouteKeys(batchId: string): Promise<Set<string>> {
    const players = await this.listPlayers(batchId)
    const routes = await Promise.all(players.map((p) => this.getRoute(p.id)))
    return new Set(routes.flatMap((r) => (r ? [r.stops.join('>')] : [])))
  }

  async putSession(s: Session): Promise<void> {
    const player = await this.getPlayer(s.playerId)
    await this.put({pk: `PLAYER#${s.playerId}`, sk: 'SESSION'}, s, {
      gsi1pk: `BATCH#${player?.batchId ?? 'unknown'}`,
      gsi1sk: `SESSION#${s.playerId}`,
    })
  }
  async getSession(playerId: string): Promise<Session | null> {
    return this.get<Session>(`PLAYER#${playerId}`, 'SESSION')
  }
  async listSessions(batchId: string): Promise<Session[]> {
    return this.queryData<Session>(`BATCH#${batchId}`, 'SESSION#')
  }

  async putSplit(s: Split): Promise<void> {
    await this.put({pk: `PLAYER#${s.playerId}`, sk: `SPLIT#${level4(s.level)}`}, s)
  }
  async listSplits(playerId: string): Promise<Split[]> {
    const res = await this.doc.send(
      new QueryCommand({
        TableName: this.table,
        KeyConditionExpression: 'pk = :p AND begins_with(sk, :s)',
        ExpressionAttributeValues: {':p': `PLAYER#${playerId}`, ':s': 'SPLIT#'},
      }),
    )
    // SAFETY: the SPLIT# range under a player pk only holds Split items.
    return (res.Items ?? []).map((i) => i.data as Split).sort((a, b) => a.level - b.level)
  }

  async appendEvent(e: GameEvent): Promise<void> {
    const rand = Math.random().toString(36).slice(2, 8)
    await this.put({pk: `PLAYER#${e.playerId}`, sk: `EVENT#${e.tsMs}#${rand}`}, e)
  }

  async addBreadcrumbs(crumbs: readonly Breadcrumb[]): Promise<void> {
    for (let i = 0; i < crumbs.length; i += 25) {
      const chunk = crumbs.slice(i, i + 25)
      await this.doc.send(
        new BatchWriteCommand({
          RequestItems: {
            [this.table]: chunk.map((c, j) => ({
              PutRequest: {
                Item: {
                  pk: `PLAYER#${c.playerId}`,
                  sk: `CRUMB#${c.tsMs}#${i + j}`,
                  data: c,
                },
              },
            })),
          },
        }),
      )
    }
  }
}
