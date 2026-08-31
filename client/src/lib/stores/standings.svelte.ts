import type {StandingRow} from '@cmh/shared'
import {api} from '../api'

class Standings {
  rows = $state<StandingRow[]>([])
  updatedAt = $state<number | null>(null)

  get self(): StandingRow | undefined {
    return this.rows.find((r) => r.isSelf)
  }

  async refresh(batchId: string, token?: string): Promise<void> {
    try {
      const {rows} = await api.standings(batchId, token)
      this.rows = rows
      this.updatedAt = Date.now()
    } catch {
      /* keep last-known */
    }
  }
}

export const standings = new Standings()
