const Router = require('@koa/router')
const router = new Router()
const db = require('../db')
const { ObjectId } = require('mongodb')

router.post('/record', async (ctx, next) => {
  const { appid, ...params } = ctx.request.body
  if (!appid) {
    await next()
    ctx.body.code = 1
    ctx.body.message = 'missing appid'
    return
  }
  const app = await db.collection('apps').findOne({ _id: new ObjectId(appid) })

  const logs = db.collection('logs')
  const params = ctx.request.body
  await logs.insertOne(params)
  await next()
})

module.exports = router
