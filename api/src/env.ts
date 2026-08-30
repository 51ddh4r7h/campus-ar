/** Runtime configuration for the API. */
export interface ApiEnv {
  /** DynamoDB table name. */
  tableName: string
  /** When set, admin routes require `X-Admin-Key` to match. */
  adminKey: string | null
}

export const envFromProcess = (): ApiEnv => ({
  tableName: process.env.TABLE_NAME ?? 'campus-movie-hunt',
  adminKey: process.env.ADMIN_KEY ?? null,
})
