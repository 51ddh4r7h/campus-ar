/** Screen + overlay routing. Deliberately tiny — no router library. */

export type Screen =
  | 'splash'
  | 'welcome'
  | 'permissions'
  | 'ready'
  | 'clue'
  | 'search'
  | 'reveal'
  | 'finish'

export type Sheet = 'howto' | 'hint' | 'standings' | 'here' | null

class Nav {
  screen = $state<Screen>('splash')
  sheet = $state<Sheet>(null)
  /** A transient full-screen recovery overlay, e.g. 'camera-lost'. */
  overlay = $state<string | null>(null)

  go(screen: Screen): void {
    this.screen = screen
    this.sheet = null
  }
  open(sheet: Exclude<Sheet, null>): void {
    this.sheet = sheet
  }
  close(): void {
    this.sheet = null
  }
}

export const nav = new Nav()
