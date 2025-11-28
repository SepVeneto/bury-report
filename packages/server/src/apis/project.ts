import { Router } from '@oak/oak'
import { Project } from '../model/project.ts'
import { Filter } from "../model/index.ts";

const router = new Router()

router.get('/project/list', async (ctx) => {
  const project = new Project(ctx.db)
  const list = await project.getAll()
  ctx.resBody = list
})

router.post('/project', async (ctx) => {
  const { name } = await ctx.request.body.json()

  if (!name) {
    ctx.response.body = {
      code: 1,
      message: '项目名称不能为空',

    }
    return
  }
  const project = new Project(ctx.db)

  const filter = new Filter({ name })
  const res = await project.findOne(filter)
  if (res) {
    ctx.response.body = {
      code: 1,
      message: '项目已存在',
    }
  } else {
    const res = await project.insertOne({ name, apps: [], is_delete: false })
    ctx.resBody = res.insertedId
    ctx.resMsg = '项目创建成功'
  }
})
router.patch('/project', async (ctx) => {
  const { id, name } = await ctx.request.body.json()
  if (!name) {
    ctx.resCode = 1
    ctx.resMsg = '项目名称不能为空'
    return
  }

  const project = new Project(ctx.db)

  await project.updateOne({ id, name })
  ctx.resMsg = '修改成功'
})
router.delete('/project', async (ctx) => {
  const id = ctx.request.url.searchParams.get('id')
  if (!id) {
    ctx.resCode = 1
    ctx.resMsg = '缺少项目ID'
    return
  }

  const project = new Project(ctx.db)
  await project.deleteOne(id)
  ctx.resMsg = '删除成功'
})

export default router
