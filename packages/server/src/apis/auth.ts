import { Context, Router } from '@oak/oak'
import jwt from 'jsonwebtoken'
import { ObjectId, type WithId } from 'mongodb'
import { SECRET } from '../utils/index.ts'
import type { AccountDocument } from '../utils/account.ts'
import { normalizeAccountName, toPublicAccount } from '../utils/account.ts'
import { hashPassword, isLegacyPassword, verifyPassword } from '../utils/password.ts'
import { verifyTotp } from '../utils/totp.ts'

const router = new Router()

const twoFactorAttempts = new Map<string, { count: number; expiresAt: number }>()
const TWO_FACTOR_MAX_ATTEMPTS = 5
const TWO_FACTOR_CHALLENGE_TTL = 5 * 60

router.post('/login', async (ctx) => {
  const body = await ctx.request.body.json()
  const name = normalizeAccountName(body.name)
  const password = body.password
  if (!name || typeof password !== 'string') {
    ctx.resCode = 1
    ctx.resMsg = '用户名或密码错误'
    return
  }

  const users = ctx.db.collection<AccountDocument>('users')

  const account = await users.findOne({
    name,
    is_delete: { $ne: true },
    status: { $ne: 'disabled' },
  })
  if (account && verifyPassword(password, account)) {
    if (isLegacyPassword(account)) {
      await users.updateOne(
        { _id: account._id },
        {
          $set: { password_hash: hashPassword(password) },
          $unset: { password: '' },
        },
      )
    }
    if (account.two_factor_enabled) {
      if (!account.two_factor_secret) {
        ctx.resCode = 1
        ctx.resMsg = '双因素验证配置异常，请联系管理员'
        return
      }
      ctx.resBody = {
        requires2FA: true,
        challenge: jwt.sign(
          {
            sub: account._id.toHexString(),
            purpose: '2fa',
          },
          SECRET,
          { expiresIn: TWO_FACTOR_CHALLENGE_TTL },
        ),
      }
      return
    }

    await completeLogin(ctx, account)
  } else {
    ctx.resCode = 1
    ctx.resMsg = '用户名或密码错误'
  }

})

router.post('/login/2fa', async (ctx) => {
  const { challenge, code } = await ctx.request.body.json()
  if (typeof challenge !== 'string' || !/^\d{6}$/.test(code || '')) {
    ctx.resCode = 1
    ctx.resMsg = '动态验证码错误'
    return
  }

  let payload: jwt.JwtPayload
  try {
    payload = jwt.verify(challenge, SECRET) as jwt.JwtPayload
  } catch {
    ctx.resCode = 1
    ctx.resMsg = '验证已过期，请重新登录'
    return
  }
  if (
    payload.purpose !== '2fa' ||
    typeof payload.sub !== 'string' ||
    !ObjectId.isValid(payload.sub)
  ) {
    ctx.resCode = 1
    ctx.resMsg = '验证凭证无效'
    return
  }

  const attempt = twoFactorAttempts.get(payload.sub)
  if (
    attempt &&
    attempt.expiresAt > Date.now() &&
    attempt.count >= TWO_FACTOR_MAX_ATTEMPTS
  ) {
    ctx.response.status = 429
    ctx.resCode = 1
    ctx.resMsg = '验证码错误次数过多，请稍后重新登录'
    return
  }

  const users = ctx.db.collection<AccountDocument>('users')
  const account = await users.findOne({
    _id: new ObjectId(payload.sub),
    is_delete: { $ne: true },
    status: { $ne: 'disabled' },
    two_factor_enabled: true,
  })
  if (!account?.two_factor_secret || !verifyTotp(account.two_factor_secret, code)) {
    const current = attempt && attempt.expiresAt > Date.now()
      ? attempt
      : { count: 0, expiresAt: Date.now() + TWO_FACTOR_CHALLENGE_TTL * 1000 }
    twoFactorAttempts.set(payload.sub, {
      count: current.count + 1,
      expiresAt: current.expiresAt,
    })
    ctx.resCode = 1
    ctx.resMsg = '动态验证码错误'
    return
  }

  twoFactorAttempts.delete(payload.sub)
  await completeLogin(ctx, account)
})

async function completeLogin(
  ctx: Context,
  account: WithId<AccountDocument>,
) {
  await ctx.db.collection<AccountDocument>('users').updateOne(
    { _id: account._id },
    { $set: { last_login_time: new Date() } },
  )
  const payload = {
    sub: account._id.toHexString(),
    account: account.name,
    time: Date.now(),
  }
  ctx.resBody = {
    token: jwt.sign(payload, SECRET),
    account: toPublicAccount(account),
  }
}

export default router
