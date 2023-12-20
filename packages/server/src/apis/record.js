const Router = require('@koa/router')
const router = new Router()
const db = require('../db')
const { ObjectId } = require('mongodb')
const { sign } = require('sign')

router.post('/record', async (ctx, next) => {
  const { sign: signStr, appid, ...params } = ctx.request.body
  const app = await db.collection('apps').findOne({ _id: new ObjectId(appid) })

  const signRes = sign(JSON.stringify({ ...params, appid}), app.secret)
  if (signRes === signStr) {
    const logs = db.collection('logs')
    const { sign, nonce, ...params } = ctx.request.body
    await logs.insertOne(params)
    await next()
  } else {
    await next()
    ctx.body.code = 1
    ctx.body.message = '非法请求'
  }
})

module.exports = router
