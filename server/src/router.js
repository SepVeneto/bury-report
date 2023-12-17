const Router = require('@koa/router')
const router = new Router()
const db = require('./db')

router.get('/report', async ctx => {
  const collection = db.collection('log')
  const res = await collection.insertOne(ctx.request.query)

  ctx.body = 'success'
})

module.exports = router