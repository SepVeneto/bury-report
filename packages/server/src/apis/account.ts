import { Context, Router } from '@oak/oak'
import { ObjectId } from 'mongodb'
import { hashPassword, verifyPassword } from '../utils/password.ts'
import {
  type AccountDocument,
  type AccountRole,
  type AccountStatus,
  normalizeAccountName,
  normalizeAccountRole,
  normalizeAccountStatus,
  toPublicAccount,
} from '../utils/account.ts'
import { escapeRegExp } from '../utils/tools.ts'

const router = new Router()
const ACCOUNT_ROLES = new Set<AccountRole>(['admin', 'member'])
const ACCOUNT_STATUSES = new Set<AccountStatus>(['active', 'disabled'])

router.get('/account/profile', async (ctx) => {
  const account = await findCurrentAccount(ctx)
  if (!account) {
    ctx.resCode = 1
    ctx.resMsg = '当前账号不存在'
    return
  }

  ctx.resBody = toPublicAccount(account)
})

router.patch('/account/password', async (ctx) => {
  const { password_old: oldPassword, password } = await ctx.request.body.json()
  if (typeof oldPassword !== 'string' || !!passwordError(password)) {
    ctx.resCode = 1
    ctx.resMsg = '密码格式不正确'
    return
  }

  const account = await findCurrentAccount(ctx)
  if (!account || !verifyPassword(oldPassword, account)) {
    ctx.resCode = 1
    ctx.resMsg = '原密码错误'
    return
  }

  await ctx.db.collection<AccountDocument>('users').updateOne(
    { _id: account._id },
    {
      $set: {
        password_hash: hashPassword(password),
        update_time: new Date(),
      },
      $unset: { password: '' },
    },
  )
  ctx.resMsg = '密码修改成功'
})

router.get('/accounts', async (ctx) => {
  if (!ensureAdmin(ctx)) return

  const page = Math.max(1, Number(ctx.request.query.page) || 1)
  const size = Math.min(100, Math.max(1, Number(ctx.request.query.size) || 20))
  const name = normalizeAccountName(ctx.request.query.name)
  const role = typeof ctx.request.query.role === 'string' ? ctx.request.query.role : ''
  const status = typeof ctx.request.query.status === 'string' ? ctx.request.query.status : ''
  const filter: Record<string, unknown> = { is_delete: { $ne: true } }

  if (name) filter.name = { $regex: escapeRegExp(name), $options: 'i' }
  if (ACCOUNT_ROLES.has(role as AccountRole)) filter.role = role
  if (ACCOUNT_STATUSES.has(status as AccountStatus)) filter.status = status

  const users = ctx.db.collection<AccountDocument>('users')
  const [list, total] = await Promise.all([
    users
      .find(filter)
      .sort({ _id: -1 })
      .skip((page - 1) * size)
      .limit(size)
      .toArray(),
    users.countDocuments(filter),
  ])

  ctx.resBody = {
    list: list.map(toPublicAccount),
    total,
  }
})

router.post('/accounts', async (ctx) => {
  if (!ensureAdmin(ctx)) return

  const body = await ctx.request.body.json()
  const name = normalizeAccountName(body.name)
  const role = normalizeAccountRole(body.role)
  const status = normalizeAccountStatus(body.status)
  const nameError = validateName(name)
  const passwordValidationError = passwordError(body.password)
  if (body.role !== undefined && !ACCOUNT_ROLES.has(body.role)) {
    ctx.resCode = 1
    ctx.resMsg = '账号角色不正确'
    return
  }
  if (body.status !== undefined && !ACCOUNT_STATUSES.has(body.status)) {
    ctx.resCode = 1
    ctx.resMsg = '账号状态不正确'
    return
  }
  if (nameError || passwordValidationError) {
    ctx.resCode = 1
    ctx.resMsg = nameError || passwordValidationError || ''
    return
  }

  const users = ctx.db.collection<AccountDocument>('users')
  const exists = await users.findOne({ name, is_delete: { $ne: true } })
  if (exists) {
    ctx.resCode = 1
    ctx.resMsg = '用户名已存在'
    return
  }

  const now = new Date()
  const result = await users.insertOne({
    name,
    password_hash: hashPassword(body.password),
    role,
    status,
    is_delete: false,
    create_time: now,
    update_time: now,
  })
  ctx.resBody = result.insertedId.toHexString()
  ctx.resMsg = '账号创建成功'
})

router.patch('/accounts', async (ctx) => {
  if (!ensureAdmin(ctx)) return

  const body = await ctx.request.body.json()
  const target = await findAccountById(ctx, body.id)
  if (!target) {
    ctx.resCode = 1
    ctx.resMsg = '账号不存在'
    return
  }

  const users = ctx.db.collection<AccountDocument>('users')
  const currentRole = normalizeAccountRole(target.role)
  const currentStatus = normalizeAccountStatus(target.status)
  const name = body.name === undefined ? target.name : normalizeAccountName(body.name)
  const role = body.role === undefined ? currentRole : body.role
  const status = body.status === undefined ? currentStatus : body.status
  const nameError = validateName(name)
  if (nameError) {
    ctx.resCode = 1
    ctx.resMsg = nameError
    return
  }
  if (!ACCOUNT_ROLES.has(role)) {
    ctx.resCode = 1
    ctx.resMsg = '账号角色不正确'
    return
  }
  if (!ACCOUNT_STATUSES.has(status)) {
    ctx.resCode = 1
    ctx.resMsg = '账号状态不正确'
    return
  }
  if (body.password !== undefined && body.password !== '' && passwordError(body.password)) {
    ctx.resCode = 1
    ctx.resMsg = passwordError(body.password) || ''
    return
  }

  const isSelf = target._id.toHexString() === ctx.account?.id
  if (isSelf && (role !== 'admin' || status !== 'active')) {
    ctx.resCode = 1
    ctx.resMsg = '不能停用当前登录账号或降低其权限'
    return
  }
  if (
    currentRole === 'admin' &&
    currentStatus === 'active' &&
    (role !== 'admin' || status !== 'active') &&
    !(await hasOtherActiveAdmin(ctx, target._id))
  ) {
    ctx.resCode = 1
    ctx.resMsg = '系统至少需要保留一个启用的管理员'
    return
  }

  const duplicate = await users.findOne({
    _id: { $ne: target._id },
    name,
    is_delete: { $ne: true },
  })
  if (duplicate) {
    ctx.resCode = 1
    ctx.resMsg = '用户名已存在'
    return
  }

  const update: Record<string, unknown> = {
    name,
    role,
    status,
    update_time: new Date(),
  }
  const unset: Record<string, ''> = {}
  if (typeof body.password === 'string' && body.password) {
    update.password_hash = hashPassword(body.password)
    unset.password = ''
  }

  await users.updateOne(
    { _id: target._id },
    {
      $set: update,
      ...(Object.keys(unset).length ? { $unset: unset } : {}),
    },
  )
  ctx.resMsg = '账号修改成功'
})

router.delete('/accounts', async (ctx) => {
  if (!ensureAdmin(ctx)) return

  const id = ctx.request.url.searchParams.get('id')
  const target = await findAccountById(ctx, id)
  if (!target) {
    ctx.resCode = 1
    ctx.resMsg = '账号不存在'
    return
  }
  if (target._id.toHexString() === ctx.account?.id) {
    ctx.resCode = 1
    ctx.resMsg = '不能删除当前登录账号'
    return
  }
  if (
    normalizeAccountRole(target.role) === 'admin' &&
    normalizeAccountStatus(target.status) === 'active' &&
    !(await hasOtherActiveAdmin(ctx, target._id))
  ) {
    ctx.resCode = 1
    ctx.resMsg = '系统至少需要保留一个启用的管理员'
    return
  }

  await ctx.db.collection<AccountDocument>('users').updateOne(
    { _id: target._id },
    {
      $set: {
        is_delete: true,
        update_time: new Date(),
      },
    },
  )
  ctx.resMsg = '账号删除成功'
})

function ensureAdmin(ctx: Context) {
  if (ctx.account?.role === 'admin') return true

  ctx.response.status = 403
  ctx.resCode = 403
  ctx.resMsg = '仅管理员可以管理账号'
  return false
}

function findCurrentAccount(ctx: Context) {
  return findAccountById(ctx, ctx.account?.id)
}

function findAccountById(
  ctx: Context,
  id?: string | null,
) {
  if (!id || !ObjectId.isValid(id)) return null

  return ctx.db.collection<AccountDocument>('users').findOne({
    _id: new ObjectId(id),
    is_delete: { $ne: true },
  })
}

async function hasOtherActiveAdmin(
  ctx: Context,
  excludedId: ObjectId,
) {
  const total = await ctx.db.collection<AccountDocument>('users').countDocuments({
    _id: { $ne: excludedId },
    role: 'admin',
    status: 'active',
    is_delete: { $ne: true },
  })
  return total > 0
}

function validateName(name: string) {
  if (!name) return '用户名不能为空'
  if (name.length > 32) return '用户名不能超过32个字符'
  return ''
}

function passwordError(password: unknown) {
  if (typeof password !== 'string' || !password) return '请输入密码'
  if (password.length < 6 || password.length > 16) return '密码长度应为6-16位'
  return ''
}

export default router
