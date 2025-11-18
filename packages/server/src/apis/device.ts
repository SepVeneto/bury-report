import { Router } from '@oak/oak'
import { Device } from "../model/device.ts";
import { RecordLog } from "../model/record.ts";
import { Filter } from "../model/index.ts";

const router = new Router()

router.get('/device', async (ctx) => {
  const device = new Device(ctx.db)

  const { page, size, ...query } = ctx.request.query
  const { uuid, start_time, end_time } = query

  const filter = new Filter()
  filter.rangeTime('create_time', start_time, end_time)
  filter.equal('uuid', uuid)

  const list = await device.pagination(page, size, filter)
  ctx.resBody = list
})

router.get('/device/:deviceId', async (ctx) => {
  const device = new Device(ctx.db)

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
      ctx.resBody = logRes.data
    } else {
      ctx.resCode = 1
      ctx.resMsg = '设备不存在'
    }
  } else {
    ctx.resBody = res
  }
})

export default router
