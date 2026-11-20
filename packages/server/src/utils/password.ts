import md5 from 'md5'
import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto'
import { Buffer } from 'node:buffer'

const KEY_LENGTH = 64
const PREFIX = 'scrypt'

export function hashPassword(password: string) {
  const salt = randomBytes(16).toString('hex')
  const hash = scryptSync(password, salt, KEY_LENGTH).toString('hex')
  return `${PREFIX}$${salt}$${hash}`
}

export function verifyPassword(password: string, stored: {
  password?: string
  password_hash?: string
}) {
  if (stored.password_hash) {
    const [prefix, salt, hash] = stored.password_hash.split('$')
    if (prefix !== PREFIX || !salt || !hash) return false

    const current = Buffer.from(hash, 'hex')
    if (current.length !== KEY_LENGTH) return false
    const target = scryptSync(password, salt, current.length)
    return current.length === target.length && timingSafeEqual(current, target)
  }

  return !!stored.password && stored.password === md5(password)
}

export function isLegacyPassword(stored: {
  password?: string
  password_hash?: string
}) {
  return !stored.password_hash
}
