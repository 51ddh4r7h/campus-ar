/**
 * Dev/demo API exposed on `window.__campushunt` (see src/main.ts).
 * Lets the ?sim rail and headless smoke tests drive the hunt without real GPS.
 */
export interface CampushuntDebugApi {
  /** Teleport the GPS signal inside a spot's radius (unlocks + CTA). */
  jump(spotId: string): void
  /** Force the AR reveal (skips waiting for tracking NORMAL). */
  reveal(): void
  /** Open the AR camera for the current target. */
  openAr(): void
}

declare global {
  interface Window {
    __campushunt?: CampushuntDebugApi
  }
}

export {}