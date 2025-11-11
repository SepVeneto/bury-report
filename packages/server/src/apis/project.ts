import { Router } from '@oak/oak'
import db from '../db.ts'
import { ObjectId } from 'mongodb'
import { normalize } from '../utils/index.ts'
import { Project } from '../model/project.ts'

const router = new Router()

router.get('/project/list', async (ctx) => {
  const project = new Project()
  const list = await project.getAll({}, { name: 1, apps: 1 })
  ctx.response.body = list
})
router.get('/project', async (ctx, next) => {
  const id = ctx.request.url.searchParams.get('id')
  const project = new Project()
  const res = await project.findById(id)
  if (res) {
    const { _id, ...res } = project
    ctx.response.body = { id: _id, ...res }
  } else {
    ctx.response.body = {
      code: 1,
      message: '没有找到指定的项目',
    }
  }
})
router.post('/project', async (ctx, next) => {
  const { name } = ctx.request.body.json()

  if (!name) {
    ctx.response.body = {
      code: 1,
      message: '项目名称不能为空',

    }
    return
  }
  const project = new Project()

  const res = await project.findOne({ name })
  if (res) {
    ctx.response.body = {
      code: 1,
      message: '项目已存在',
    }
  } else {
    const res = await project.insertOne({ name, apps: [] })
    ctx.response.body = res.insertedId
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
