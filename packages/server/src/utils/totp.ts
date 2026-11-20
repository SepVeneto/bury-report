import { Buffer } from 'node:buffer'
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto'

const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'
const DEFAULT_PERIOD = 30
const DEFAULT_DIGITS = 6

export function generateTotpSecret(length = 20) {
  return encodeBase32(randomBytes(length))
}

export function generateTotp(
  secret: string,
  timestamp = Date.now(),
  period = DEFAULT_PERIOD,
  digits = DEFAULT_DIGITS,
) {
  const counter = Math.floor(timestamp / 1000 / period)
  const counterBuffer = Buffer.alloc(8)
  counterBuffer.writeBigUInt64BE(BigInt(counter))

  const digest = createHmac('sha1', decodeBase32(secret))
    .update(counterBuffer)
    .digest()
  const offset = digest[digest.length - 1] & 0x0f
  const binary = (
    ((digest[offset] & 0x7f) << 24) |
    ((digest[offset + 1] & 0xff) << 16) |
    ((digest[offset + 2] & 0xff) << 8) |
    (digest[offset + 3] & 0xff)
  )

  return String(binary % (10 ** digits)).padStart(digits, '0')
}

export function verifyTotp(
  secret: string,
  code: string,
  options: {
    timestamp?: number
    period?: number
    digits?: number
    window?: number
  } = {},
) {
  if (!/^\d{6}$/.test(code)) return false

  const {
    timestamp = Date.now(),
    period = DEFAULT_PERIOD,
    digits = DEFAULT_DIGITS,
    window = 1,
  } = options
  const expectedCode = Buffer.from(code)

  for (let offset = -window; offset <= window; offset++) {
    const current = generateTotp(
      secret,
      timestamp + offset * period * 1000,
      period,
      digits,
    )
    const currentBuffer = Buffer.from(current)
    if (
      currentBuffer.length === expectedCode.length &&
      timingSafeEqual(currentBuffer, expectedCode)
    ) {
      return true
    }
  }
  return false
}

export function buildTotpUri(options: {
  issuer: string
  account: string
  secret: string
}) {
  const { issuer, account, secret } = options
  const label = `${encodeURIComponent(issuer)}:${encodeURIComponent(account)}`
  const params = new URLSearchParams({
    secret,
    issuer,
    algorithm: 'SHA1',
    digits: String(DEFAULT_DIGITS),
    period: String(DEFAULT_PERIOD),
  })
  return `otpauth://totp/${label}?${params.toString()}`
}

function encodeBase32(bytes: Uint8Array) {
  let bits = 0
  let value = 0
  let output = ''

  for (const byte of bytes) {
    value = (value << 8) | byte
    bits += 8
    while (bits >= 5) {
      output += BASE32_ALPHABET[(value >>> (bits - 5)) & 31]
      bits -= 5
    }
  }
  if (bits > 0) {
    output += BASE32_ALPHABET[(value << (5 - bits)) & 31]
  }
  return output
}

function decodeBase32(input: string) {
  const normalized = input.toUpperCase().replace(/=|\s|-/g, '')
  let bits = 0
  let value = 0
  const output: number[] = []

  for (const character of normalized) {
    const index = BASE32_ALPHABET.indexOf(character)
    if (index < 0) throw new Error('Invalid base32 secret')

    value = (value << 5) | index
    bits += 5
    if (bits >= 8) {
      output.push((value >>> (bits - 8)) & 0xff)
      bits -= 8
    }
  }
  return Buffer.from(output)
}
