import { Router } from '@oak/oak'
import { Source } from "../model/source.ts";
import { Filter } from "../model/index.ts";

const router = new Router()

router.get('/source/options', async (ctx) => {
  const source = new Source(ctx.db)

  const filter = new Filter({ pid: null })
  const options = await source.getAll(filter)
  ctx.resBody = options
})

router.get('/source', async (ctx) => {
  const source = new Source(ctx.db)

  const res = await source.list()
  ctx.resBody = res
})

router.post('/source', async (ctx) => {
  const source = new Source(ctx.db)

  const body = await ctx.request.body.json()
  await source.insertOne(body)
  ctx.resMsg = '创建成功'
})

router.put('/source/:sourceId', async (ctx) => {
  const source = new Source(ctx.db)

  const body = await ctx.request.body.json()
  await source.updateOne(body)
  ctx.resMsg = '修改成功'
})

router.delete('/source/:sourceId', async (ctx) => {
  const source = new Source(ctx.db)

  const { sourceId } = ctx.params
  await source.deleteOne(sourceId)
  ctx.resMsg = '删除成功'
})

router.get('/source/:sourceId/children', async (ctx) => {
  const source = new Source(ctx.db)
  const sourceId = ctx.params.sourceId
  const filter = new Filter({ pid: sourceId })
  const res = await source.getAll(filter)
  ctx.resBody = res
})

export default router
