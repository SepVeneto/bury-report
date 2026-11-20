import { Context, Router } from '@oak/oak'
import { Project } from '../model/project.ts'
import { Filter } from "../model/index.ts";
import type { AccountDocument } from '../utils/account.ts'

const router = new Router()

router.get('/project/list', async (ctx) => {
  const project = new Project(ctx.db)
  const list = ctx.account?.role === 'admin'
    ? await project.getAll()
    : await project.getVisible(ctx.account?.projectIds || [])
  ctx.resBody = list
})

router.post('/project', async (ctx) => {
  if (!ensureAdmin(ctx)) return

  const { name } = await ctx.request.body.json()

  if (!name) {
    ctx.resCode = 1
    ctx.resMsg = '项目名称不能为空'
    return
  }
  const project = new Project(ctx.db)

  const filter = new Filter({ name })
  const res = await project.findOne(filter)
  if (res) {
    ctx.resCode = 1
    ctx.resMsg = '项目已存在'
  } else {
    const res = await project.insertOne({ name, apps: [], is_delete: false })
    ctx.resBody = res.insertedId
    ctx.resMsg = '项目创建成功'
  }
})
router.patch('/project', async (ctx) => {
  if (!ensureAdmin(ctx)) return

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
  if (!ensureAdmin(ctx)) return

  const id = ctx.request.url.searchParams.get('id')
  if (!id) {
    ctx.resCode = 1
    ctx.resMsg = '缺少项目ID'
    return
  }

  const project = new Project(ctx.db)
  await Promise.all([
    project.deleteOne(id),
    ctx.db.collection<AccountDocument>('users').updateMany(
      { project_ids: id },
      { $pull: { project_ids: id } },
    ),
  ])
  ctx.resMsg = '删除成功'
})

function ensureAdmin(ctx: Context) {
  if (ctx.account?.role === 'admin') return true
  ctx.response.status = 403
  ctx.resCode = 403
  ctx.resMsg = '仅管理员可以管理项目'
  return false
}

export default router
