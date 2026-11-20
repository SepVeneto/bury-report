import jwt from 'jsonwebtoken'
import type { ObjectId } from 'mongodb'
import { SECRET } from './constant.ts'

export const SESSION_TTL_SECONDS = 30 * 24 * 60 * 60

export function issueSessionToken(account: {
  _id: ObjectId
  name: string
}) {
  return jwt.sign(
    {
      sub: account._id.toHexString(),
      account: account.name,
      time: Date.now(),
    },
    SECRET,
    { expiresIn: SESSION_TTL_SECONDS },
  )
}
