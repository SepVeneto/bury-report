import db from '../db.js'
import Router from '@koa/router'
import jwt from 'jsonwebtoken'
import { SECRET } from '../utils/index.js'

import app from './app.js'
import auth from './auth.js'
import project from './project.js'
import portal from './portal.js'

const router = new Router()

const whiteList = ['/login', '/register', '/record', '/captcha']

router.use(async (ctx, next) => {
  if (whiteList.includes(ctx.url)) {
    await next()
    return
  }

  const token = ctx.request.headers['authorization'] || ctx.request.query.token

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
      ctx.status = 403
      ctx.body = err.message
    }
  }
})

router.use(app.routes())
router.use(auth.routes())
router.use(project.routes())
router.use(portal.routes())

router.use((ctx) => {
  ctx.body = {
    code: 0,
    data: ctx.body,
    message: 'success'
  }
})

export default router
