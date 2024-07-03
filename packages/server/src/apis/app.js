import Router from '@koa/router'
import db from '../db.js'
import { ObjectId } from 'mongodb'
import md5 from 'md5'
import { SECRET, normalize } from '../utils/index.js'
import { Project } from '../model/project.js'
import { App } from '../model/app.js'

const router = new Router()

function randomColor() {
  const r = Math.floor(Math.random() * 256)
  const g = Math.floor(Math.random() * 256)
  const b = Math.floor(Math.random() * 256)

  return `rgb(${r}, ${g}, ${b})`
}

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
  const { pid, name, icon } = ctx.request.body

  if (!name) {
    await next()
    ctx.body.code = 1
    ctx.body.message = '应用名称不能为空'
    return
  }

  const project = new Project()
  const app = new App()

  const newApp = {
    name,
    icon: icon || randomColor(),
  }
  const aid = await app.insertOne(newApp)
  await project.insertApp(pid, { id: aid.insertedId, ...newApp })
  ctx.body = aid.insertedId

  await next()
  ctx.body.message = '应用创建成功'
})
router.patch('/app', async (ctx, next) => {
  const { id, name, icon } = ctx.request.body
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
      apps.updateOne({ _id: appId }, { $set: {
        name,
        icon: icon || randomColor(),
      } }),
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
    match['create_time'] = { $gte: new Date(start), $lte: new Date(end) }
  }

  const list = await logs
    .find(match, { projection: { _id: 0, id: '$_id', create_time: 1, data: 1 }})
    .sort({ create_time: -1 })
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
    match['create_time'] = { $gte: new Date(start), $lte: new Date(end) }
  }

  const list = await logs
    .find(match, { projection: { _id: 0, id: '$_id', create_time: 1, data: 1, uuid: 1 }})
    .sort({ create_time: -1 })
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

router.get('/app/:appId/statistics', async (ctx, next) => {
  const { appId } = ctx.params
  const logs = db.collection('logs')
  const match = {
    appid: appId,
    type: '__BR_COLLECT_INFO__',
  }

  const totalOpen = await logs.countDocuments(match)
  const yesterdayTotalOpen = await logs.countDocuments({
    ...match,
    /**
     * TODO
     */
    create_time: { $gte: new Date('2024-01-04 00:00:00'), $lte: new Date('2024-01-05 00:00:00') }
  })
  let list = await logs.find(match, { projection: { _id: 0, deviceId: '$data.uuid' }}).toArray()
  let tempObj = {}
  const total = list.reduce((total, item) => {
    if (!tempObj[item.deviceId]) {
      tempObj[item.deviceId] = true
      total += 1
    }
    return total
  }, 0)
  tempObj = {}
  list = await logs.find({
    ...match,
    create_time: { $gte: new Date('2024-01-04 00:00:00'), $lte: new Date('2024-01-05 00:00:00') }
  }, { projection: { _id: 0, deviceId: '$data.uuid' }}).toArray()
  const yesterdayTotal = list.reduce((total, item) => {
    if (!tempObj[item.deviceId]) {
      tempObj[item.deviceId] = true
      total += 1
    }
    return total
  }, 0)

  ctx.body = {
    total,
    yesterdayTotal,
    totalOpen,
    yesterdayTotalOpen,
  }
  await next()
})

router.get('/app/:appId/chart/:type', async (ctx, next) => {
  const { appId, type } = ctx.params
  const logs = db.collection('logs')
  const match = {
    appid: appId,
    type: '__BR_COLLECT_INFO__',
  }
 

  switch (type) {
    case 'totalOpenTrend':
      {
        const res = await logs.aggregate([
          {
            $match: match
          },
          {
            $project: {
              yearMonthDay: { $dateToString: { format: '%Y-%m-%d', date: { $add: ['$create_time', 8 * 60 * 60 * 1000] }}}
            }
          },
          {
            $group: {
              _id: '$yearMonthDay',
              count: { $sum: 1 }
            }
          },
          { $sort: { _id: 1 } },
          { $project: { _id: 0, date: '$_id', count: 1 }}
        ]).toArray()
        ctx.body = res
        await next()
      }
      break
    case 'yesterdayOpenTrend':
      {
        const res = await logs.aggregate([
          {
            $match: {
              ...match,
              create_time: { $gte: new Date('2024-01-04 00:00:00'), $lte: new Date('2024-01-05 00:00:00') }
            }
          },
          {
            $project: {
              yearMonthDay: { $dateToString: { format: '%H', date: { $add: ['$create_time', 8 * 60 * 60 * 1000] }}}
            }
          },
          {
            $group: {
              _id: '$yearMonthDay',
              count: { $sum: 1 }
            }
          },
          { $sort: { _id: 1 } },
          { $project: { _id: 0, date: '$_id', count: 1 }}
        ]).toArray()
        ctx.body = res
        await next()
      }
      break
    case 'deviceType':
      {
        const tempObj = {}
        const _arr = await logs.find(match, { projection: { _id: 0, 'data.uuid': 1, 'data.on': 1 }}).toArray()
        const unionList = []
        _arr.forEach(item => {
          if (item.data && !tempObj[item.data.uuid]) {
            tempObj[item.data.uuid] = true
            unionList.push(item)
          }
        })

        let android = 0
        let ios = 0
        unionList.forEach(item => {
          switch (item.data.on) {
            case 'android':
              android += 1;
              break;
            case 'ios':
              ios += 1
              break
          }
        })
        ctx.body = {
          android,
          ios,
        }
      }
      await next()
      break
    case 'deviceBrand':
      {
        const tempObj = {}
        const _arr = await logs.find(match, { projection: { _id: 0, 'data.uuid': 1, 'data.db': 1 }}).toArray()
        const unionList = []
        _arr.forEach(item => {
          if (item.data && !tempObj[item.data.uuid]) {
            tempObj[item.data.uuid] = true
            unionList.push(item)
          }
        })

        const res = {}
        unionList.forEach(item => {
          const brand = item.data.db
          if (res[brand]) {
            res[brand] += 1
          } else {
            res[brand] = 1
          }
        })
        ctx.body = res
        await next()
      }
      break
  }
})

router.patch('/app/:appId/move_to', async (ctx, next) => {
  const { appId } = ctx.params
  const { projectId } = ctx.request.body


  const project = new Project()
  const app = new App()
  const oappId = ObjectId.createFromHexString(appId)
  await project.col.updateOne(
    { 'apps.id': oappId },
    { $pull: { apps: { id: oappId } }},
  )
  const moveApp = await app.findById(appId, { name: 1, icon: 1 })
  await project.col.updateOne({
    _id: ObjectId.createFromHexString(projectId),
  }, {
    $push: { apps: moveApp }
  })

  await next()

  ctx.body.message = '移动成功'
})

export default router
