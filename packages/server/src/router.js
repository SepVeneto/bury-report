const Router = require('@koa/router')
const router = new Router()
const db = require('./db')
const md5 = require('md5')
const jwt = require('jsonwebtoken')
const SECRET = 'veneto'

router.get('/report', async ctx => {
  const collection = db.collection('log')
  const res = await collection.insertOne(ctx.request.query)

  ctx.body = 'success'
})

router.get('/checkin', async ctx => {
  const token = ctx.request.headers['authorization']

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
        ctx.body = 'invalid status'
      } else {
        ctx.body = 'check token success'
      }
    } catch (err) {
      console.error(err)
      ctx.body = err.message
    }
  }
})
router.post('/login', async ctx => {
  const { name, password } = ctx.request.body

  const users = db.collection('users')

  const isAccess = await users.findOne({ name, password: md5(password)} )
  if (isAccess) {
    const payload = {
      account: name,
      time: Date.now(),
    }
    ctx.body = JSON.stringify({ token: jwt.sign(payload, SECRET) })
  } else {
    ctx.body = 'account error'
  }

})
router.post('/register', async ctx => {
  const { name, password } = ctx.request.body

  const users = db.collection('users')
  const res = await users.findOne({ name })
  if (res) {
    ctx.body = 'The name has been registered'
    return
  }
  const md5pwd = md5(password)
  users.insertOne({ name, password: md5pwd })

  ctx.body = 'register success'
})

module.exports = router