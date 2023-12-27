const Router = require('@koa/router')
const router = new Router()
const db = require('../db')
const { ObjectId } = require('mongodb')

router.post('/record', async (ctx, next) => {
  let body = ctx.request.body
  if (typeof body === 'string') {
    body = JSON.parse(body)
  }
  const { appid } = body
  if (!appid) {
    await next()
    ctx.body.code = 1
    ctx.body.message = 'missing appid'
    return
  }
  const id = new ObjectId(appid)
  console.log(id.id)
  const logs = db.collection('logs')
  await logs.insertOne({ ...body, createTime: new Date() })
  await next()
})

module.exports = router
