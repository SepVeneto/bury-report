const Router = require('@koa/router')
const router = new Router()
const db = require('../db')
const { ObjectId } = require('mongodb')
const { normalize } = require('../utils')

router.get('/project/list', async (ctx, next) => {
  const { page = 1, size = 20, ...query } = ctx.request.query
  const projects = db.collection('projects')

  const _query = normalize(query) || {}
  const match = { is_delete: { $ne: true }}
  if (_query.name) {
    match.name = { $regex: _query.name }
  }
  if (_query.app) {
    match.apps = { $elemMatch: { name: { $regex: _query.app }} }
  }
  const total = await projects.countDocuments(_query)
  const offset = (page - 1) * size
  const list = await projects
    .find(match, { projection: { _id: 0, id: '$_id', name: true, apps: true }})
    .skip(offset)
    .limit(Number(size))
    .toArray()

  list.forEach(item => {
    item.apps = item.apps.map(item => item.name)
  })
  ctx.body = {
    total,
    list,
  }

  await next()
})
router.get('/project', async (ctx, next) => {
  const { id } = ctx.query
  const project = await db.collection('projects').findOne({ _id: new ObjectId(id), is_delete: { $ne: true } })
  // const res = await db.collection('projects').aggregate([
  //   { $match: { _id: new ObjectId(id) } },
  //   { $lookup: {
  //     localField: 'apps',
  //     from: 'apps',
  //     foreignField: '_id',
  //     as: 'apps'
  //   }},
  //   {
  //     $project: {
  //       _id: 0,
  //       id: '$_id',
  //       name: 1,
  //       apps: 1,
  //     }
  //   }
  // ]).toArray()
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
  const { name, apps } = ctx.request.body

  if (!name) {
    await next()
    ctx.body.code = 1
    ctx.body.message = '项目名称不能为空'
    return
  }

  const project = await db.collection('project').findOne({ name, id_delete: { $ne: true } })
  if (project) {
    await next()
    ctx.body.code = 1
    ctx.body.message = '项目已存在'
  } else {
    const _apps = await db.collection('apps').find({
      _id: { $in: apps.map(app => new ObjectId(app)) },
      is_delete: { $ne: true },
    }, { projection: { _id: 0, id: '$_id', name: 1 }}).toArray()
    const res = await db.collection('projects').insertOne({ name, apps: _apps })
    ctx.body = res.insertedId
    await next()
    ctx.body.message = '项目创建成功'
  }
})
router.patch('/project', async (ctx, next) => {
  const { id, name, apps } = ctx.request.body
  if (!name) {
    await next()
    ctx.body.code = 1
    ctx.body.message = '项目名称不能为空'
    return
  }

  const projects = db.collection('projects')
  const project = await projects.findOne({ _id: new ObjectId(id), is_delete: { $ne: true } })

  if (project) {
    const appList = await db.collection('apps').find({ _id: { $in: apps.map(app => new ObjectId(app))}}).toArray()
    await projects.updateOne({ _id: new ObjectId(id) }, { $set: {
      name,
      apps: appList.map(app => ({
        id: new ObjectId(app._id),
        name: app.name,
      }))
    } })

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
  await projects.updateOne({ _id: new ObjectId(id)}, { $set: { is_delete: true }})
  await next()
  ctx.body.message = '删除成功'
})

module.exports = router
