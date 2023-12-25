const Router = require('@koa/router')
const router = new Router()
const db = require('../db')
const { ObjectId } = require('mongodb')
const { normalize } = require('../utils')

router.get('/project/list', async (ctx, next) => {
  const { page = 1, size = 20, ...query } = ctx.request.query
  const projects = db.collection('projects')

  const _query = normalize(query)
  const total = await projects.countDocuments(_query)
  const offset = (page - 1) * size
  const list = await projects.find(_query).skip(offset).limit(Number(size)).toArray()
  ctx.body = { total, list: list.map(item => {
    const { _id, ...record } = item
    return {
      id: _id,
      ...record,
    }
  }) }

  await next()
})
router.get('/project', async (ctx, next) => {
  const { id } = ctx.query
  const project = await db.collection('projects').findOne({ _id: new ObjectId(id) })
  if (project) {
    const { _id, ...res } = project
    ctx.body = { id: _id, ...res }
    await next()
  } else {
    await next()
    ctx.body.code = 1
    ctx.body.message = '没有找到指定的项目'
  }
})
router.post('/project', async (ctx, next) => {
  const { name } = ctx.request.body

  if (!name) {
    await next()
    ctx.body.code = 1
    ctx.body.message = '项目名称不能为空'
    return
  }

  const project = await db.collection('project').findOne({ name })
  if (project) {
    await next()
    ctx.body.code = 1
    ctx.body.message = '项目已存在'
  } else {
    const res = await db.collection('projects').insertOne({ name })
    ctx.body = res.insertedId
    await next()
    ctx.body.message = '项目创建成功'
  }
})
router.patch('/project', async (ctx, next) => {
  const { id, name } = ctx.request.body
  if (!name) {
    await next()
    ctx.body.code = 1
    ctx.body.message = '项目名称不能为空'
    return
  }

  const projects = db.collection('projects')
  const project = await projects.findOne({ _id: new ObjectId(id) })

  if (project) {
    await projects.updateOne({ _id: new ObjectId(id) }, { $set: { name } })
    await next()
    ctx.body.message = '修改成功'
  } else {
    await next()
    ctx.body.code = 1
    ctx.body.message = '找不到该项目'
  }
})
router.delete('/project', async (ctx, next) => {
  const { id } = ctx.query
  if (!id) {
    await next()
    ctx.body.code = 1
    ctx.body.message = '缺少项目ID'
    return
  }

  const projects = db.collection('projects')
  await projects.findOneAndDelete({ _id: new ObjectId(id)})
  await next()
  ctx.body.message = '删除成功'
})

module.exports = router
