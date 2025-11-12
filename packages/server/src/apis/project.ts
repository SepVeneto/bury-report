import { Context as OakContext, Router } from '@oak/oak'
import { Project } from '../model/project.ts'

interface Context extends OakContext {
  resMsg?: string
  resBody?: unknown
  resCode?: number
}

const router = new Router()

router.get('/project/list', async (ctx: Context) => {
  const project = new Project()
  const list = await project.getAll({}, { name: 1, apps: 1 })
  ctx.resBody = list
})
router.get('/project', async (ctx: Context) => {
  const id = ctx.request.url.searchParams.get('id')
  const project = new Project()
  const res = await project.findById(id)
  if (res) {
    const { _id, ...res } = project
    ctx.resBody = { id: _id, ...res }
  } else {
    ctx.resCode = 1
    ctx.resMsg = '没有找到指定的项目'
  }
})
router.post('/project', async (ctx: Context) => {
  const { name } = await ctx.request.body.json()

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
    ctx.resBody = res.insertedId
    ctx.resMsg = '项目创建成功'
  }
})
router.patch('/project', async (ctx: Context) => {
  const { id, name } = await ctx.request.body.json()
  if (!name) {
    ctx.resCode = 1
    ctx.resMsg = '项目名称不能为空'
    return
  }

  const project = new Project()

  await project.updateOne({ id, name })
  ctx.resMsg = '修改成功'
})
router.delete('/project', async (ctx: Context) => {
  const { id } = await ctx.request.body.json()
  if (!id) {
    ctx.resCode = 1
    ctx.resMsg = '缺少项目ID'
    return
  }

  const project = new Project()
  await project.deleteOne(id)
  ctx.resMsg = '删除成功'
})

export default router
