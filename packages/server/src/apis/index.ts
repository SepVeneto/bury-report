import { client } from '../db.ts'
import { Router } from '@oak/oak'
import jwt from 'jsonwebtoken'
import { SECRET } from '../utils/index.ts'

import app from './app.ts'
import auth from './auth.ts'
import project from './project.ts'
import source from './source.ts'
import record from './record.ts'
import device from './device.ts'
import task from './task.ts'
import alert from './alert.ts'
import statistics from './statistics.ts'
import { normalizeQuery } from "../utils/tools.ts";

const router = new Router()

const whiteList = ['/login', '/register', '/record', '/captcha']

router.use(async (ctx, next) => {
  ctx.db = client.db('reporter')
  ctx.request.query = normalizeQuery(ctx)
  await next()
})

router.use(async (ctx, next) => {
  if (whiteList.includes(ctx.request.url.pathname)) {
    await next()
    return
  }

  const token = ctx.request.headers.get('authorization') || ctx.request.url.searchParams.get('token')

  if (!token) {
    ctx.response.status = 401
  } else {
    /**
     * TODO: 通过redis检查token
     */
    try {
      const res = jwt.verify(token, SECRET)
      const isLogin = await ctx.db.collection('users').findOne({ name: res.account })
      if (!isLogin) {
        ctx.response.status = 403
      } else {
        await next()
      }
    } catch (err) {
      console.error(err)
      ctx.response.status = 403
      ctx.response.body = String(err)
    }
  }
})

const portalEntry = ['/project', '/app']
router.use(async (ctx, next) => {
  if (whiteList.includes(ctx.request.url.pathname) || portalEntry.some(item => ctx.request.url.pathname.startsWith(item))) {
    await next()
    return
  }
  const appid = ctx.request.headers.get('appid')
  if (!appid) {
    ctx.response.status = 403
    ctx.response.body = '缺少appid'
    return
  }

  const _db = client.db(`app_${appid}`)
  ctx.db = _db
  await next()
})

router.use(async (ctx, next) => {
  try {
    await next()
    ctx.response.body = {
      code: ctx.resCode || 0,
      data: ctx.resBody || null,
      message: ctx.resMsg || 'success'
    }
  }
  catch (err) {
    console.error(err)
    ctx.response.status = 500
    ctx.response.body = {
      code: ctx.resCode || 1,
      message: ctx.resMsg || '服务器错误'
    }
  }
})

router.use(app.routes())
router.use(auth.routes())
router.use(project.routes())
router.use(source.routes())
router.use(record.routes())
router.use(device.routes())
router.use(task.routes())
router.use(statistics.routes())
router.use(alert.routes())

export default router
