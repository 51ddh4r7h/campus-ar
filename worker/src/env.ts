/** Cloudflare bindings available to the Worker. */
export interface Env {
  DB: D1Database
  STANDINGS: DurableObjectNamespace
}
