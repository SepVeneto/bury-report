import { Router } from '@oak/oak'
import { Session, DeviceLog, CustomId, ICustomId, MpTrack } from "../model/device.ts";
import { RecordApi, RecordError, RecordTrack } from '../model/record.ts'
import { RecordLog } from "../model/record.ts";
import { Filter } from "../model/index.ts";
import { Db } from 'mongodb'
import COS from 'cos-nodejs-sdk-v5'
import { Redis } from 'ioredis'
import { desensitize } from "../utils/index.ts";
import { VideoTransformer } from "../utils/rrweb2video.ts";
import { dedupeReplayRecords, loadReplayPayloads, mergeReplayPayloads } from "../utils/replay.ts";

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

/**
 * 会话的录屏分片列表。worker 的过期补偿与上传/删除存在竞争，同一个文件可能被重复挂到
 * `event_urls` 上，先按 key 去重，避免同一段回放被读取两次。
 */
function getEventKeys(urls?: string[]) {
  return Array.from(new Set(urls ?? []))
}

/**
 * 旧版本的回放数据：统一切到 COS 分片之前，录屏事件落在 `records_track`、
 * 小程序页面轨迹落在 `records_mp_track`；老会话没有 `event_urls`，回放数据只有这一份。
 * 迁移之后这两个集合不再写入，新会话查出来是空的。
 */
async function getLegacyReplayRecords(db: Db, session: string) {
  const filter = new Filter()
  filter.equal('session', session)
  const [tracks, mpTracks] = await Promise.all([
    new RecordTrack(db).getAll(filter),
    new MpTrack(db).getAll(filter),
  ])
  return [...tracks, ...mpTracks]
}

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
  const db = ctx.db
  const log = new RecordLog(db)
  const networkLog = new RecordApi(db)
  const errorLog = new RecordError(db)
  const session = new Session(db)
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
  const eventFutures = getEventKeys(detail.event_urls).map(url => {
    return cos.getObjectUrl({
      Bucket: BUCKET,
      Region: REGION,
      Key: url.replace(`https://${BUCKET}.cos.${REGION}.myqcloud.com/`, ''),
    })
  })
  const eventUrls = await Promise.all(eventFutures)
  const net = await networkLog.getAll(filter)
  const err = await errorLog.getAll(filter)
  const logs = await log.getAll(filter)
  // 回放的拼接与去重统一在 server 完成：客户端分片重试、上报服务二次拆分、worker 补偿
  // 都会让同一段数据在 COS 里出现多次。
  // 旧版本前端没有 `merged` 参数，仍然自己按 event_urls 读 COS，不受影响（也不会多拉一份数据）。
  const replay = ctx.request.url.searchParams.get('merged') === '1'
    ? mergeReplayPayloads([
      ...await loadReplayPayloads(eventUrls),
      ...await getLegacyReplayRecords(db, ctx.params.sessionId),
    ])
    : null

  const resBody: Record<string, unknown> = {
    event_urls: eventUrls,
    net: dedupeReplayRecords(net),
    err: dedupeReplayRecords(err),
    log: dedupeReplayRecords(logs),
  }
  if (replay) {
    resBody.events = replay.events
    resBody.records = replay.records
  }
  ctx.resBody = resBody
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
  const db = ctx.db
  const session = new Session(db)
  const sessionFilter = new Filter()
  sessionFilter.equal('session', ctx.params.sessionId)
  const detail = await session.findOne(sessionFilter)
  if (!detail) {
    ctx.resCode = 1
    ctx.resMsg = '没有找到指定的会话'
    return
  }
  const eventFutures = getEventKeys(detail.event_urls).map(url => {
    return cos.getObjectUrl({
      Bucket: BUCKET,
      Region: REGION,
      Key: url.replace(`https://${BUCKET}.cos.${REGION}.myqcloud.com/`, ''),
    })
  })
  const eventUrls = await Promise.all(eventFutures)
  const { events } = mergeReplayPayloads([
    ...await loadReplayPayloads(eventUrls),
    ...await getLegacyReplayRecords(db, ctx.params.sessionId),
  ])
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
