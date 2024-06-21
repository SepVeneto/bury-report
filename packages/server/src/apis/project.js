import Router from '@koa/router'
import db from '../db.js'
import { ObjectId } from 'mongodb'
import { normalize } from '../utils/index.js'
import { Project } from '../model/index.js'

const router = new Router()

router.get('/project/list', async (ctx, next) => {
  const project = new Project(db)
  const list = await project.getAll()
  ctx.body = list

  await next()
})
router.get('/project', async (ctx, next) => {
  const { id } = ctx.query
  const project = new Project(db)
  const res = await project.findById(id)
  if (res) {
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
  const project = new Project(db)

  const res = await project.findOne({ name })
  if (res) {
    await next()
    ctx.body.code = 1
    ctx.body.message = '项目已存在'
  } else {
    project.insertOne({ name })
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

  const project = new Project(db)

  await project.updateOne({ id, name })
  await next()
  ctx.body.message = '修改成功'
  // } else {
  //   await next()
  //   ctx.body.code = 1
  //   ctx.body.message = '找不到该项目'
  // }
})
router.delete('/project', async (ctx, next) => {
  const { id } = ctx.query
  if (!id) {
    await next()
    ctx.body.code = 1
    ctx.body.message = '缺少项目ID'
    return
  }

  const project = new Project(db)
  await project.deleteOne(id)
  await next()
  ctx.body.message = '删除成功'
})

export default router
