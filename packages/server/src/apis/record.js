const Router = require('@koa/router')
const router = new Router()
const db = require('../db')
const { ObjectId } = require('mongodb')

router.post('/record', async (ctx, next) => {
  let body = ctx.request.body
  if (typeof body === 'string') {
    body = JSON.parse(body)
  }
  const { appid, ...params } = body
  if (!appid) {
    await next()
    ctx.body.code = 1
    ctx.body.message = 'missing appid'
    return
  }
  const app = await db.collection('apps').findOne({ _id: new ObjectId(appid) })

  const logs = db.collection('logs')
  const data = ctx.request.body
  await logs.insertOne(body)
  await next()
})

module.exports = router
