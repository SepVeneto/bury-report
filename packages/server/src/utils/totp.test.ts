import { generateTotp, verifyTotp } from './totp.ts'

function assertEquals(actual: unknown, expected: unknown) {
  if (actual !== expected) {
    throw new Error(`expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`)
  }
}

Deno.test('TOTP matches RFC 6238 SHA-1 vectors', () => {
  const secret = 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ'

  assertEquals(generateTotp(secret, 59_000), '287082')
  assertEquals(generateTotp(secret, 1_111_111_109_000), '081804')
  assertEquals(generateTotp(secret, 1_234_567_890_000), '005924')
})

Deno.test('TOTP accepts the adjacent time window and rejects invalid codes', () => {
  const secret = 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ'
  const timestamp = 1_234_567_890_000
  const previous = generateTotp(secret, timestamp - 30_000)
  const current = generateTotp(secret, timestamp)

  assertEquals(verifyTotp(secret, previous, { timestamp }), true)
  assertEquals(verifyTotp(secret, current, { timestamp }), true)
  assertEquals(verifyTotp(secret, '000000', { timestamp }), false)
  assertEquals(verifyTotp(secret, '12345', { timestamp }), false)
})
