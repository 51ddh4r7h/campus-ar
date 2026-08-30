/** Cloudflare bindings and vars available to the Worker. */
export interface Env {
  DB: D1Database
  STANDINGS: DurableObjectNamespace
  /** When set, admin routes require `X-Admin-Key` to match. */
  ADMIN_KEY?: string
}
