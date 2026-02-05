import { Router } from "@oak/oak";
import { Alert, AlertError } from "../model/alert.ts";
import { Filter } from "../model/index.ts";

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
  const { name, enabled, notify, source } = body
  await alert.insertOne({
    name,
    source,
    enabled,
    notify,
    is_delete: false,
  })
  await fetch(`${Deno.env.get("NOTIFY_URL")}/notify/sync-alert-rule`, {
    headers: {
      "appid": ctx.request.headers.get('appid') || '',
      "notify-token": Deno.env.get("NOTIFY_TOKEN") || '',
    }
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

  await fetch(`${Deno.env.get("NOTIFY_URL")}/notify/sync-alert-rule`, {
    headers: {
      "appid": ctx.request.headers.get('appid') || '',
      "notify-token": Deno.env.get("NOTIFY_TOKEN") || '',
    }
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

  await fetch(`${Deno.env.get("NOTIFY_URL")}/notify/sync-alert-rule`, {
    headers: {
      "appid": ctx.request.headers.get('appid') || '',
      "notify-token": Deno.env.get("NOTIFY_TOKEN") || '',
    }
  })

  ctx.resMsg = '修改成功'
})

router.delete('/alert/rule/:ruleId', async (ctx) => {
  const alert = new Alert(ctx.db)

  const ruleId = ctx.params.ruleId
  await alert.deleteOne(ruleId)

  await fetch(`${Deno.env.get("NOTIFY_URL")}/notify/sync-alert-rule`, {
    headers: {
      "appid": ctx.request.headers.get('appid') || '',
      "notify-token": Deno.env.get("NOTIFY_TOKEN") || '',
    }
  })

  ctx.resMsg = '删除成功'
})

router.get('/alert/history/list', async (ctx) => {
  const error = new AlertError(ctx.db)

  const { page = 1, size = 10, ...query } = ctx.request.query
  const { start_time, summary, end_time, fingerprint } = query
  const filter = new Filter()

  filter.like('fingerprint', fingerprint)
  filter.rangeTime('last_seen', start_time, end_time)
  filter.like('summary', summary)

  const res = await error.pagination(
    Number(page),
    Number(size),
    filter,
    { last_seen: -1 },
  )
  ctx.resBody = res

})

export default router
