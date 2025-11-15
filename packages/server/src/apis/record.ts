import { Router } from '@oak/oak'
import { RecordApi, RecordError, RecordLog } from "../model/record.ts";

const router = new Router()

router.get('/record/logs', async (ctx) => {
  const record = new RecordLog(ctx.db)

  const { page, size, ...query } = ctx.request.query

  const res = await record.pagination(Number(page), Number(size), query)
  ctx.resBody = res
})

router.get('/record/errors', async (ctx) => {
  const record = new RecordError(ctx.db)

  const { page, size, ...query } = ctx.request.query
  const res = await record.pagination(Number(page), Number(size), query)
  ctx.resBody = res
})

router.get('/record/networks', async (ctx) => {
  const record = new RecordApi(ctx.db)

  const { page, size, ...query } = ctx.request.query
  const res = await record.pagination(Number(page), Number(size), query)
  ctx.resBody = res
})

export default router
