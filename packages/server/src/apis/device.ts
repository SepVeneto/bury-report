import { Router } from '@oak/oak'
import { Session, DeviceLog, CustomId, ICustomId } from "../model/device.ts";
import { RecordApi, RecordError } from '../model/record.ts'
import { RecordLog } from "../model/record.ts";
import { Filter } from "../model/index.ts";
import COS from 'cos-nodejs-sdk-v5'
import { Redis } from 'ioredis'
import { desensitize } from "../utils/index.ts";
import { VideoTransformer } from "../utils/rrweb2video.ts";

const cos = new COS({
  SecretId: Deno.env.get('SECRECT_ID'),
  SecretKey: Deno.env.get('SECRECT_KEY'),
})
const BUCKET = Deno.env.get('BUCKET')
const REGION = Deno.env.get('REGION')

if (!BUCKET || !REGION) {
  throw new Error('COS_SECRET_ID or COS_SECRET_KEY is not set')
}

const router = new Router()

router.get('/custom-id', async (ctx) => {
  const custom = new CustomId(ctx.db)
  const { customId } = ctx.request.query
  const deStr = desensitize(customId)
  const filter = new Filter<ICustomId>()
  filter.equal('id', deStr)

  const res = await custom.findOne(filter)
  ctx.resBody = res
})


router.get('/device', async (ctx) => {
  const device = new DeviceLog(ctx.db)

  const { page, size, ...query } = ctx.request.query
  const { uuid, start_time, end_time, session } = query

  const filter = new Filter()
  filter.rangeTime('create_time', start_time, end_time)
  filter.equal('uuid', uuid)
  filter.equal('session', session)

  const list = await device.pagination(page, size, { filter })
  ctx.resBody = list
})

router.get('/device/:deviceId', async (ctx) => {
  const device = new DeviceLog(ctx.db)

  const id = ctx.params.deviceId
  const filter = new Filter({ uuid: id})
  const res = await device.findOne(filter)
  if (!res) {
    const log = new RecordLog(ctx.db)

    const filter = new Filter()
    filter.equal('type', "__BR_COLLECT_INFO__")
    filter.equal('uuid', id)

    const logRes = await log.findOne(filter)
    if (logRes) {
      ctx.resBody = { ...logRes.data, ip: logRes.ip }
    } else {
      ctx.resCode = 1
      ctx.resMsg = '设备不存在'
    }
  } else {
    ctx.resBody = { ...res?.data, ip: res?.ip }
  }
})

router.get('/device/:deviceId/session/list', async (ctx) => {
  const session = new Session(ctx.db)
  const { page = 1, size = 10, ...query } = ctx.request.query
  // const { start_time, end_time } = query
  const uuid = ctx.params.deviceId
  const filter = new Filter()
  filter.equal('uuid', uuid)
  filter.equal('session', query.session)
  const list = await session.pagination(page, size, { filter })
  list.list.forEach(item => delete item.event_urls)
  ctx.resBody = list
})

router.get('/session/:sessionId', async ctx => {
  const log = new RecordLog(ctx.db)
  const networkLog = new RecordApi(ctx.db)
  const errorLog = new RecordError(ctx.db)
  const session = new Session(ctx.db)
  const filter = new Filter()
  filter.equal('session', ctx.params.sessionId)
  const sessionFilter = new Filter()
  sessionFilter.equal('session', ctx.params.sessionId)
  const detail = await session.findOne(sessionFilter)
  if (!detail) {
    ctx.resCode = 1
    ctx.resMsg = '没有找到指定的会话'
    return
  }
  const eventFutures = detail.event_urls?.map(url => {
    return cos.getObjectUrl({
      Bucket: BUCKET,
      Region: REGION,
      Key: url.replace(`https://${BUCKET}.cos.${REGION}.myqcloud.com/`, ''),
    })
  }) || []
  const eventUrls = await Promise.all(eventFutures)
  const net = await networkLog.getAll(filter)
  const err = await errorLog.getAll(filter)
  const logs = await log.getAll(filter)

  ctx.resBody = {
    event_urls: eventUrls,
    net: net,
    err: err,
    log: logs,
  }
})

router.post('/session/:sessionId/sync', async ctx => {
  const session = ctx.params.sessionId
  const appid = ctx.request.headers.get('appid')
  const redisUrl = Deno.env.get('REDIS_HOST')
  if (!redisUrl) {
    throw new Error('REDIS_HOST is not set')
  }
  const [host, port] = redisUrl.split(':')
  const redis = new Redis(Number(port), host)
  // 提前过期，只有大于0才会触发ttl通知
  await redis.expire(`session:${appid}/${session}:shadow`, 1)
  ctx.resMsg = '下发成功'
})

router.post('/session/:sessionId/export', async ctx => {
  ctx.response.headers.set("X-Accel-Buffering", "no");
  const target = await ctx.sendEvents()
  const session = new Session(ctx.db)
  const sessionFilter = new Filter()
  sessionFilter.equal('session', ctx.params.sessionId)
  const detail = await session.findOne(sessionFilter)
  if (!detail) {
    ctx.resCode = 1
    ctx.resMsg = '没有找到指定的会话'
    return
  }
  const eventFutures = detail.event_urls?.map(url => {
    return cos.getObjectUrl({
      Bucket: BUCKET,
      Region: REGION,
      Key: url.replace(`https://${BUCKET}.cos.${REGION}.myqcloud.com/`, ''),
    })
  }) || []
  const eventUrls = await Promise.all(eventFutures.map(async url => {
    const res = await fetch(url)
    return (await res.json()) as any[]
  }))
  const events = eventUrls.reduce((acc, item) => {
    acc.push(...(item.map(each => each.data.events)))
    return acc
  }, []).flat()
  const transformer = new VideoTransformer()
  let timer: number | null = setInterval(() => {
    target.dispatchMessage(transformer.state)
  }, 1 * 1000)

  await transformer.transform(events)
  clearInterval(timer)
  timer = null

  target.dispatchMessage(transformer.state)
  target.dispatchMessage('[DONE]')

  target.close()
})

export default router
