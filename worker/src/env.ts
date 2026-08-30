/** Cloudflare Worker bindings and vars. */
export interface Env {
  DB: D1Database
  /** When set, admin routes require `X-Admin-Key` to match. */
  ADMIN_KEY?: string
}
