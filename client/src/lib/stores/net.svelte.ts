/** Connectivity state — flipped by every API call's outcome. */
class Net {
  online = $state(true)

  mark(ok: boolean): void {
    if (this.online !== ok) this.online = ok
  }
}

export const net = new Net()
