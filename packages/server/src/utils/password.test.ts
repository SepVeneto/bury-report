import md5 from 'md5'
import {
  hashPassword,
  isLegacyPassword,
  verifyPassword,
} from './password.ts'

function assertEquals(actual: unknown, expected: unknown) {
  if (actual !== expected) {
    throw new Error(`expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`)
  }
}

Deno.test('scrypt password hashes verify without storing plaintext', () => {
  const passwordHash = hashPassword('Admin123456')

  assertEquals(passwordHash.startsWith('scrypt$'), true)
  assertEquals(passwordHash.includes('Admin123456'), false)
  assertEquals(verifyPassword('Admin123456', { password_hash: passwordHash }), true)
  assertEquals(verifyPassword('wrong-password', { password_hash: passwordHash }), false)
  assertEquals(isLegacyPassword({ password_hash: passwordHash }), false)
})

Deno.test('legacy md5 passwords remain compatible for migration', () => {
  const password = 'Legacy123456'
  const stored = { password: md5(password) }

  assertEquals(verifyPassword(password, stored), true)
  assertEquals(verifyPassword('wrong-password', stored), false)
  assertEquals(isLegacyPassword(stored), true)
})
