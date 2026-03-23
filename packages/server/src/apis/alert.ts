import { Router } from "@oak/oak";
import { Alert, AlertError, AlertSetting, IAlertError } from "../model/alert.ts";
import { Filter } from "../model/index.ts";
import { ObjectId } from 'mongodb'
import dayjs from 'dayjs'

const router = new Router()

router.get("/alert/rule/list", async (ctx) => {
  const alert = new Alert(ctx.db)

  const { page = 1, size = 10, name, id } = ctx.request.query
  const filter = new Filter()
  if (id && id.length === 24) {
    filter.equal('_id',  new ObjectId(String(id)))
  }
  filter.like('name', name)
  const res = await alert.pagination(page, size, { filter })
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
    { filter, sort: { last_seen: -1 } },
  )
  ctx.resBody = res

})

router.get('/alert/setting', async (ctx) => {
  const as = new AlertSetting(ctx.db)
  const res = await as.get()
  ctx.resBody = res || { status: false }
})

router.put('/alert/setting', async (ctx) => {
  const body = await ctx.request.body.json()
  const as = new AlertSetting(ctx.db)
  const res = await as.set(body)
  ctx.resBody = res
  ctx.resMsg = '设置成功'
})

router.post('/alert/summary/push', async (ctx) => {
  const err = new AlertError(ctx.db)
  const setting = new AlertSetting(ctx.db)

  const config = await setting.get()
  if (!config?.notify) {
    ctx.resMsg = '未配置通知地址'
    return
  }

  const { first, common }= await err.getPushData()
  first.sort((a, b) => b.count - a.count)
  common.sort((a, b) => b.count - a.count)

  await triggerNotify(config.notify, first.slice(0, 5), common.slice(0, 5))

  ctx.resMsg = '推送成功'
})

export default router

export async function triggerNotify(
  webhook: string,
  first: IAlertError[],
  common: IAlertError[],
) {
  const data = {
    "msgtype": "markdown_v2",
    "markdown_v2": {
      "content": [
        '# 昨日告警TOP5',
        '## 首次触发',
        '| 触发原文 | 最后触发时间 | 触发次数 |',
        '| ------ | -------- | -------- |',
        ...first.map(item => formatMdFirstLine(item)),
        '## 常规触发',
        '| 告警内容 | 首次触发时间 | 累计触发次数 |',
        '| ------- | ---------- | ----------- |',
        ...common.map(item => formatMdCommonLine(item)),
      ].join('\n')
    }
  }
  const msg = JSON.stringify(data)
  console.log('length', msg.length)

  await fetch(webhook, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: msg,
  }).catch(err => {
    throw err
  })
}

function normalizeMessage(msg: string, limit = 100) {
  if (msg.length > limit) {
    return msg.slice(0, limit) + '...'
  } else {
    return msg
  }
}

function formatMdFirstLine(item: IAlertError) {
  const firstSeen = dayjs(item.first_seen).format('HH:mm:ss')
  return `| ${normalizeMessage(item.message)} | ${firstSeen} | ${item.count} |`
}

function formatMdCommonLine(item: IAlertError) {
  const firstSeen = dayjs(item.first_seen).format('YYYY-MM-DD')
  return `| ${item.message.replaceAll('\n', ' ')} | ${firstSeen} | ${item.count} |`
}
