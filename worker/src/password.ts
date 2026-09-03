/**
 * Password hashing for the Worker runtime.
 *
 * PBKDF2 over WebCrypto — Cloudflare Workers has no bcrypt/argon2, and PBKDF2
 * with a high iteration count is the standard equivalent available here. The
 * stored string is self-describing so the iteration count can be raised later
 * without invalidating existing hashes:
 *
 *   pbkdf2$<iterations>$<salt-b64>$<hash-b64>
 *
 * The stakes are modest — this guards a 45-minute onboarding game, not an
 * account — but a leaked D1 dump should still not hand over plaintext.
 */

const ITERATIONS = 100_000
const KEY_BITS = 256
const SALT_BYTES = 16

const b64 = (buf: ArrayBuffer): string => btoa(String.fromCharCode(...new Uint8Array(buf)))
const unb64 = (s: string): Uint8Array => Uint8Array.from(atob(s), (c) => c.charCodeAt(0))

async function derive(password: string, salt: Uint8Array, iterations: number): Promise<string> {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, [
    'deriveBits',
  ])
  const bits = await crypto.subtle.deriveBits(
    {name: 'PBKDF2', salt, iterations, hash: 'SHA-256'},
    key,
    KEY_BITS,
  )
  return b64(bits)
}

export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(SALT_BYTES))
  const hash = await derive(password, salt, ITERATIONS)
  return `pbkdf2$${ITERATIONS}$${b64(salt.buffer)}$${hash}`
}

/** Constant-time within a hash length; the format itself is not secret. */
export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parts = stored.split('$')
  if (parts.length !== 4 || parts[0] !== 'pbkdf2') return false
  const iterations = Number(parts[1])
  if (!Number.isInteger(iterations) || iterations < 1) return false
  const candidate = await derive(password, unb64(parts[2]!), iterations)
  const a = new TextEncoder().encode(candidate)
  const b = new TextEncoder().encode(parts[3]!)
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a[i]! ^ b[i]!
  return diff === 0
}
