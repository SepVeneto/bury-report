import { Context, Router } from '@oak/oak'
import jwt from 'jsonwebtoken'
import { ObjectId, type WithId } from 'mongodb'
import { SECRET } from '../utils/index.ts'
import type { AccountDocument } from '../utils/account.ts'
import { normalizeAccountName, toPublicAccount } from '../utils/account.ts'
import { hashPassword, isLegacyPassword, verifyPassword } from '../utils/password.ts'
import {
  buildTotpUri,
  generateTotpSecret,
  verifyTotp,
} from '../utils/totp.ts'
import { issueSessionToken } from '../utils/session.ts'

const router = new Router()

const twoFactorAttempts = new Map<string, { count: number; expiresAt: number }>()
const TWO_FACTOR_MAX_ATTEMPTS = 5
const TWO_FACTOR_CHALLENGE_TTL = 5 * 60
const ACCOUNT_SETUP_CHALLENGE_TTL = 10 * 60
const TWO_FACTOR_SETUP_TTL = 10 * 60 * 1000

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
    if (account.must_reset_password) {
      ctx.resBody = {
        requiresPasswordReset: true,
        resetToken: issueFlowToken(account._id, 'password-reset'),
      }
      return
    }
    if (account.must_bind_two_factor && !account.two_factor_enabled) {
      ctx.resBody = {
        requires2FASetup: true,
        setupToken: issueFlowToken(account._id, '2fa-setup'),
      }
      return
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

router.post('/login/password/reset', async (ctx) => {
  const { resetToken, password } = await ctx.request.body.json()
  const account = await findFlowAccount(ctx, resetToken, 'password-reset')
  if (!account) {
    ctx.resCode = 1
    ctx.resMsg = '重置凭证无效或已过期'
    return
  }
  if (!account.must_reset_password) {
    ctx.resCode = 1
    ctx.resMsg = '当前账号无需重置密码'
    return
  }
  const passwordValidationError = passwordFormatError(password)
  if (passwordValidationError) {
    ctx.resCode = 1
    ctx.resMsg = passwordValidationError
    return
  }
  if (verifyPassword(password, account)) {
    ctx.resCode = 1
    ctx.resMsg = '新密码不能与临时密码相同'
    return
  }

  const users = ctx.db.collection<AccountDocument>('users')
  await users.updateOne(
    { _id: account._id },
    {
      $set: {
        password_hash: hashPassword(password),
        must_reset_password: false,
        update_time: new Date(),
      },
      $unset: { password: '' },
    },
  )
  const updated = await users.findOne({ _id: account._id })
  if (!updated) {
    ctx.resCode = 1
    ctx.resMsg = '账号不存在'
    return
  }

  if (updated.must_bind_two_factor && !updated.two_factor_enabled) {
    ctx.resBody = {
      requires2FASetup: true,
      setupToken: issueFlowToken(updated._id, '2fa-setup'),
    }
    return
  }
  await completeLogin(ctx, updated)
})

router.post('/login/2fa/setup', async (ctx) => {
  const { setupToken } = await ctx.request.body.json()
  const account = await findFlowAccount(ctx, setupToken, '2fa-setup')
  if (!account) {
    ctx.resCode = 1
    ctx.resMsg = '绑定凭证无效或已过期'
    return
  }
  if (account.must_reset_password) {
    ctx.resCode = 1
    ctx.resMsg = '请先重置密码'
    return
  }
  if (account.two_factor_enabled) {
    ctx.resCode = 1
    ctx.resMsg = '双因素验证已绑定'
    return
  }

  const secret = generateTotpSecret()
  const expiresAt = new Date(Date.now() + TWO_FACTOR_SETUP_TTL)
  await ctx.db.collection<AccountDocument>('users').updateOne(
    { _id: account._id },
    {
      $set: {
        two_factor_pending_secret: secret,
        two_factor_pending_expires: expiresAt,
        update_time: new Date(),
      },
    },
  )
  ctx.resBody = {
    secret,
    otpauth_url: buildTotpUri({
      issuer: Deno.env.get('TOTP_ISSUER') || 'Bury Report',
      account: account.name,
      secret,
    }),
    expires_at: expiresAt.toISOString(),
  }
})

router.post('/login/2fa/enable', async (ctx) => {
  const { setupToken, code } = await ctx.request.body.json()
  const account = await findFlowAccount(ctx, setupToken, '2fa-setup')
  if (!account) {
    ctx.resCode = 1
    ctx.resMsg = '绑定凭证无效或已过期'
    return
  }
  if (account.must_reset_password) {
    ctx.resCode = 1
    ctx.resMsg = '请先重置密码'
    return
  }
  if (!/^\d{6}$/.test(code || '')) {
    ctx.resCode = 1
    ctx.resMsg = '动态验证码错误'
    return
  }
  if (
    !account.two_factor_pending_secret ||
    !account.two_factor_pending_expires ||
    account.two_factor_pending_expires.getTime() < Date.now()
  ) {
    ctx.resCode = 1
    ctx.resMsg = '绑定已过期，请重新扫码'
    return
  }
  if (!verifyTotp(account.two_factor_pending_secret, code)) {
    ctx.resCode = 1
    ctx.resMsg = '动态验证码错误'
    return
  }

  const users = ctx.db.collection<AccountDocument>('users')
  await users.updateOne(
    { _id: account._id },
    {
      $set: {
        two_factor_enabled: true,
        two_factor_secret: account.two_factor_pending_secret,
        must_bind_two_factor: false,
        update_time: new Date(),
      },
      $unset: {
        two_factor_pending_secret: '',
        two_factor_pending_expires: '',
      },
    },
  )
  const updated = await users.findOne({ _id: account._id })
  if (!updated) {
    ctx.resCode = 1
    ctx.resMsg = '账号不存在'
    return
  }
  await completeLogin(ctx, updated)
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
  ctx.resBody = {
    token: issueSessionToken(account),
    account: toPublicAccount(account),
  }
}

async function findFlowAccount(
  ctx: Context,
  token: unknown,
  purpose: 'password-reset' | '2fa-setup',
) {
  if (typeof token !== 'string') return null

  try {
    const payload = jwt.verify(token, SECRET) as jwt.JwtPayload
    if (
      payload.purpose !== purpose ||
      typeof payload.sub !== 'string' ||
      !ObjectId.isValid(payload.sub)
    ) {
      return null
    }
    return await ctx.db.collection<AccountDocument>('users').findOne({
      _id: new ObjectId(payload.sub),
      is_delete: { $ne: true },
      status: { $ne: 'disabled' },
    })
  } catch {
    return null
  }
}

function issueFlowToken(accountId: ObjectId, purpose: 'password-reset' | '2fa-setup') {
  return jwt.sign(
    {
      sub: accountId.toHexString(),
      purpose,
    },
    SECRET,
    { expiresIn: ACCOUNT_SETUP_CHALLENGE_TTL },
  )
}

function passwordFormatError(password: unknown) {
  if (typeof password !== 'string' || !password) return '请输入新密码'
  if (password.length < 6 || password.length > 16) return '密码长度应为6-16位'
  return ''
}

export default router
