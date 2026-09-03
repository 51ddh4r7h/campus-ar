import {describe, expect, it} from 'vitest'
import {hashPassword, verifyPassword} from './password'

describe('password hashing', () => {
  it('never stores the plaintext', async () => {
    const stored = await hashPassword('hunter2-and-friends')
    expect(stored).not.toContain('hunter2')
    expect(stored.startsWith('pbkdf2$')).toBe(true)
  })

  it('salts — the same password hashes differently each time', async () => {
    const a = await hashPassword('same-password')
    const b = await hashPassword('same-password')
    expect(a).not.toBe(b)
  })

  it('verifies the right password', async () => {
    const stored = await hashPassword('correct horse battery staple')
    expect(await verifyPassword('correct horse battery staple', stored)).toBe(true)
  })

  it('rejects the wrong password', async () => {
    const stored = await hashPassword('correct horse battery staple')
    expect(await verifyPassword('Correct horse battery staple', stored)).toBe(false)
    expect(await verifyPassword('', stored)).toBe(false)
  })

  it('rejects a malformed stored string rather than throwing', async () => {
    expect(await verifyPassword('x', 'not-a-hash')).toBe(false)
    expect(await verifyPassword('x', 'pbkdf2$abc$salt$hash')).toBe(false)
    expect(await verifyPassword('x', '')).toBe(false)
  })
})
