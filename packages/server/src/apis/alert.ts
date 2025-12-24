import { Router } from "@oak/oak";
import { Alert } from "../model/alert.ts";

const router = new Router()

router.get("/alert/rule/list", async (ctx) => {
  const alert = new Alert(ctx.db)

  const { page = 1, size = 10 } = ctx.request.query
  const res = await alert.pagination(page, size)
  ctx.resBody = res
})

router.post('/alert/rule', async (ctx) => {
  const alert = new Alert(ctx.db)

  const body = await ctx.request.body.json()
  const { name, enabled, notify, strategy, source } = body
  await alert.insertOne({
    name,
    source,
    enabled,
    strategy,
    notify,
    is_delete: false,
  })

  ctx.resMsg = '创建成功'
})

router.patch('/alert/rule/:ruleId/toggle', async (ctx) => {
  const alert = new Alert(ctx.db)

  const ruleId = ctx.params.ruleId

  const body = await ctx.request.body.json()
  await alert.updateOne({
    id: ruleId,
    enabled: body.enabled,
  })

  ctx.resMsg = '切换成功'
})

router.put('/alert/rule/:ruleId', async (ctx) => {
  const alert = new Alert(ctx.db)

  const ruleId = ctx.params.ruleId
  const body = await ctx.request.body.json()
  const { source, name, enabled, notify, strategy } = body
  await alert.updateOne({
    id: ruleId,
    strategy,
    name,
    source,
    enabled,
    notify,
  })

  await fetch(`http://localhost:8870/notify/sync-alert-rule`, {
    headers: {
      "appid": ctx.request.headers.get('appid') || '',
    }
  })

  ctx.resMsg = '修改成功'
})

router.delete('/alert/rule/:ruleId', async (ctx) => {
  const alert = new Alert(ctx.db)

  const ruleId = ctx.params.ruleId
  await alert.deleteOne(ruleId)
  ctx.resMsg = '删除成功'
})

export default router
