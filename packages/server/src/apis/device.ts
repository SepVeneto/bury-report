import { Router } from '@oak/oak'
import { Session, DeviceLog } from "../model/device.ts";
import { RecordApi, RecordError } from '../model/record.ts'
import { RecordLog } from "../model/record.ts";
import { Filter } from "../model/index.ts";
import COS from 'npm:cos-nodejs-sdk-v5'

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

router.get('/device', async (ctx) => {
  const device = new DeviceLog(ctx.db)

  const { page, size, ...query } = ctx.request.query
  const { uuid, start_time, end_time } = query

  const filter = new Filter()
  filter.rangeTime('create_time', start_time, end_time)
  filter.equal('uuid', uuid)

  const list = await device.pagination(page, size, filter)
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
  const list = await session.pagination(page, size, filter)
  list.list.forEach(item => delete item.event_urls)
  ctx.resBody = list
})

router.get('/session/:sessionId', async ctx => {
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
  if (!detail.event_urls) {
    ctx.resCode = 1
    ctx.resMsg = '当前会话没有记录'
    return
  }
  const eventFutures = detail.event_urls.map(url => {
    return cos.getObjectUrl({
      Bucket: BUCKET,
      Region: REGION,
      Key: url.replace(`https://${BUCKET}.cos.${REGION}.myqcloud.com/`, ''),
    })
  })
  const eventUrls = await Promise.all(eventFutures)
  const net = await networkLog.getAll(filter)
  const err = errorLog.getAll(filter)

  ctx.resBody = {
    event_urls: eventUrls,
    net: net,
    err: err,
  }

})

export default router
