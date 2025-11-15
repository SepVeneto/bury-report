import { Router } from '@oak/oak'
import { Device } from "../model/device.ts";

const router = new Router()

router.get('/device', async (ctx) => {
  const device = new Device(ctx.db)

  const { page, size, ...query } = ctx.request.query
  const list = await device.pagination(page, size, query)
  ctx.resBody = list
})

router.get('/device/:deviceId', async (ctx) => {
  const device = new Device(ctx.db)

  const id = ctx.params.deviceId
  const res = await device.findById(id)
  ctx.resBody = res
})

export default router
