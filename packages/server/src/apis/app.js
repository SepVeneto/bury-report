const Router = require('@koa/router')
const router = new Router()
const db = require('../db')
const { ObjectId } = require('mongodb')
const md5 = require('md5')
const { SECRET } = require('../utils')
const { normalize } = require('../utils')

router.get('/app/list', async (ctx, next) => {
  const { page = 1, size = 20, ...query } = ctx.request.query
  const apps = db.collection('apps')

  const _query = normalize(query)
  const offset = (page - 1) * size
  const match = {
    is_delete: { $ne: true }
  }
  if (_query.name) {
    match.name = { $regex: _query.name }
  }
  if (_query.appId) {
    try {
      match._id = new ObjectId(_query.appId)
    } catch {
      match._id = _query.appId
    }
  }
  const res = await apps.aggregate([
    {
      $match: match,
    },
    { $facet: {
      total: [{ $count: 'total' }],
      list: [{ $skip: offset }, { $limit: Number(size) }]
    }},
    {
      $project: {
        total: { $ifNull: [{ $arrayElemAt: ['$total.total', 0]}, 0] },
        list: 1,
      }
    }
  ]).toArray()
  ctx.body = {
    total: res[0].total,
    list: res[0].list.map(item => {
      const { _id,...record } = item
      return {
        id: _id,
      ...record,
      }
    })
  }
  await next()
})
router.get('/app/options', async (ctx, next) => {
  const apps = db.collection('apps')
  const res = await apps.aggregate([
    { $match: { is_delete: { $ne: true }}},
    {
      $project: {
        _id: 0,
        value: '$_id',
        label: '$name',
      }
    }
  ]).toArray()
  ctx.body = res
  await next()
})
router.get('/app', async (ctx, next) => {
  const { id } = ctx.query
  const app = await db.collection('apps').findOne({ _id: new ObjectId(id), is_delete: { $ne: true } })
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

  const app = await db.collection('apps').findOne({ name, is_delete: { $ne: true } })
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
  const projects = db.collection('projects')
  const appId = new ObjectId(id)
  const app = await apps.findOne({ _id: appId, is_delete: { $ne: true } })

  if (app) {
    await Promise.all([
      apps.updateOne({ _id: appId }, { $set: { name } }),
      projects.updateMany(
        { 'apps.id': appId },
        { $set: { 'apps.$.name': name }},
      )
    ])
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
  const projects = db.collection('projects')
  const appId = new ObjectId(id)
  await Promise.all([
    apps.updateOne({ _id: appId }, { $set: { is_delete: true } }),
    projects.updateMany(
      { 'apps.id': appId },
      { $pull: { apps: { id: appId } }},
    )
  ])
  await next()
  ctx.body.message = '删除成功'
})
/**
 * deprecated
 */
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

router.get('/app/:appId/logs', async (ctx, next) => {
  const { page = 1, size = 20, ...query } = ctx.request.query
  const { appId } = ctx.params
  const logs = db.collection('logs')
  const offset = (page - 1) * size

  const match = normalize({
    appid: appId,
    type: '__BR_COLLECT_INFO__',
    'data.on': query.deviceType,
    'data.up': query.hostPlatform,
  })
  if (query.deviceId) {
    match['data.uuid'] = { $regex: query.deviceId }
  }
  if (query.deviceModel) {
    match['data.dm'] = { $regex: query.deviceModel }
  }
  if (query.deviceBrand) {
    match['data.db'] = { $regex: query.deviceBrand }
  }
  if (query['timerange[]']) {
    const [start, end] = query['timerange[]']
    match['createTime'] = { $gte: new Date(start), $lte: new Date(end) }
  }

  const list = await logs
    .find(match, { projection: { _id: 0, id: '$_id', createTime: 1, data: 1 }})
    .sort({ createTime: -1 })
    .skip(offset)
    .limit(Number(size))
    .toArray()
  const total = await logs.countDocuments(match)

  ctx.body = {
    list,
    total,
  }
  await next()
})

router.get('/app/:appId/errors', async (ctx, next) => {
  const { page = 1, size = 20, ...query } = ctx.request.query
  const { appId } = ctx.params
  const logs = db.collection('logs')
  const offset = (page - 1) * size

  const match = normalize({
    appid: appId,
    type: '__BR_COLLECT_ERROR__',
    'data.on': query.deviceType,
    'data.up': query.hostPlatform,
  })
  if (query.deviceModel) {
    match['data.dm'] = { $regex: query.deviceModel }
  }
  if (query.deviceBrand) {
    match['data.db'] = { $regex: query.deviceBrand }
  }
  if (query['timerange[]']) {
    const [start, end] = query['timerange[]']
    match['createTime'] = { $gte: new Date(start), $lte: new Date(end) }
  }

  const list = await logs
    .find(match, { projection: { _id: 0, id: '$_id', createTime: 1, data: 1, uuid: 1 }})
    .sort({ createTime: -1 })
    .skip(offset)
    .limit(Number(size))
    .toArray()
  const total = await logs.countDocuments(match)

  ctx.body = {
    list,
    total,
  }
  await next()
})


module.exports = router
