const Router = require('@koa/router')
const router = new Router()
const db = require('../db')
const { ObjectId } = require('mongodb')
const md5 = require('md5')
const { SECRET } = require('../utils')

router.get('/app/list', async (ctx, next) => {
  const { page = 1, size = 20, ...query } = ctx.request.query
  const apps = db.collection('apps')

  const total = await db.collection('apps').countDocuments(query)
  const offset = (page - 1) * size
  const list = await apps.find(query).skip(offset).limit(Number(size)).toArray()
  ctx.body = { total, list }

  await next()
})
router.get('/app', async (ctx, next) => {
  const { id } = ctx.query
  const app = await db.collection('apps').findOne({ _id: new ObjectId(id) })
  if (app) {
    const { _id, ...res } = app
    ctx.body = { id: _id, ...res }
    await next()
  } else {
    await next()
    ctx.body.code = 1
    ctx.body.message = '没有找到指定的应用'
  }
})
router.post('/app', async (ctx, next) => {
  const { name } = ctx.request.body

  if (!name) {
    await next()
    ctx.body.code = 1
    ctx.body.message = '应用名称不能为空'
    return
  }

  const app = await db.collection('apps').findOne({ name })
  if (app) {
    await next()
    ctx.body.code = 1
    ctx.body.message = '应用已存在'
  } else {
    const res = await db.collection('apps').insertOne({ name })
    ctx.body = res.insertedId
    await next()
    ctx.body.message = '应用创建成功'
  }
})
router.patch('/app', async (ctx, next) => {
  const { id, name } = ctx.request.body
  if (!name) {
    await next()
    ctx.body.code = 1
    ctx.body.message = '应用名称不能为空'
    return
  }

  const apps = db.collection('apps')
  const app = await apps.findOne({ _id: new ObjectId(id) })

  if (app) {
    await apps.updateOne({ _id: new ObjectId(id) }, { $set: { name } })
    await next()
    ctx.body.message = '修改成功'
  } else {
    await next()
    ctx.body.code = 1
    ctx.body.message = '找不到该应用'
  }
})
router.delete('/app', async (ctx, next) => {
  const { id } = ctx.query
  if (!id) {
    await next()
    ctx.body.code = 1
    ctx.body.message = '缺少应用ID'
    return
  }

  const apps = db.collection('apps')
  await apps.findOneAndDelete({ _id: new ObjectId(id)})
  await next()
  ctx.body.message = '删除成功'
})
router.post('/generate', async (ctx, next) => {
  const { id } = ctx.request.body
  if (!id) {
    await next()
    ctx.body.code = 1
    ctx.body.message = '缺少应用ID'
    return
  }
  const secret = md5(`${id}-${Date.now()}-${SECRET}`)
  await db.collection('apps').findOneAndUpdate({ _id: new ObjectId(id)}, { $set: { secret }})
  ctx.body = secret
  await next()
  ctx.body.message = '密钥生成成功'
})


module.exports = router
