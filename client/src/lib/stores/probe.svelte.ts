import type {NearbyResult} from '@cmh/shared'

/** The latest /session/nearby result — shared between the app loop and the HUD. */
class Probe {
  last = $state<NearbyResult | null>(null)
  reset(): void {
    this.last = null
  }
}

export const probe = new Probe()
