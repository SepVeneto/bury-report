import db from '../db.ts'
import { Router } from '@oak/oak'
import jwt from 'jsonwebtoken'
import { SECRET } from '../utils/index.ts'

import app from './app.ts'
import auth from './auth.ts'
import project from './project.ts'
import portal from './portal.ts'

const router = new Router()

const whiteList = ['/login', '/register', '/record', '/captcha']

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
      const isLogin = await db.collection('users').findOne({ name: res.account })
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

router.use(async (ctx, next) => {
  await next()

  try {
  if (ctx.response.body) {
    ctx.response.body = {
      code: 0,
      data: ctx.response.body,
      message: 'success'
    }
  }
  }
  catch (err) {
    console.error(err)
    ctx.response.status = 500
    ctx.response.body = {
      code: 1,
      message: '服务器错误'
    }
  }
})

router.use(app.routes())
router.use(auth.routes())
router.use(project.routes())
router.use(portal.routes())

export default router
