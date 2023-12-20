const Router = require('@koa/router')
const router = new Router()
const db = require('../db')
const md5 = require('md5')
const jwt = require('jsonwebtoken')
const { SECRET } = require('../utils')

router.post('/login', async (ctx, next) => {
  const { name, password } = ctx.request.body

  const users = db.collection('users')

  const isAccess = await users.findOne({ name, password: md5(password)} )
  if (isAccess) {
    const payload = {
      account: name,
      time: Date.now(),
    }
    ctx.body = { token: jwt.sign(payload, SECRET) }
    await next()
  } else {
    await next()
    ctx.body.code = 1
    ctx.body.message = '用户名或密码错误'
  }

})
router.post('/register', async (ctx, next) => {
  const { name, password } = ctx.request.body

  const users = db.collection('users')
  const res = await users.findOne({ name })
  if (res) {
    await next()
    ctx.body.code = 1
    ctx.body.message = 'The name has been registered'
    return
  }
  const md5pwd = md5(password)
  users.insertOne({ name, password: md5pwd })

  await next()
  ctx.body.message = '注册成功'
})

module.exports = router
