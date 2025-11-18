import { Router } from '@oak/oak'
import { RecordApi, RecordError, RecordLog } from "../model/record.ts";
import { Filter } from "../model/index.ts";

const router = new Router()

router.get('/record/logs', async (ctx) => {
  const record = new RecordLog(ctx.db)

  const { page, size, ...query } = ctx.request.query
  const { uuid, data, type } = query

  const filter = new Filter()
  filter.model.$and = [{
    "type": { "$ne": "__BR_COLLECT_INFO__" }
  }]

  if (uuid) {
    filter.model.uuid = uuid
  }
  if (type) {
    filter.model.type = { $regex: type }
  }
  if (data) {
    filter.model.$and?.push({
      data: { $regex: data }
    })
  }

  const res = await record.pagination(Number(page), Number(size), filter)
  ctx.resBody = res
})

router.get('/record/errors', async (ctx) => {
  const record = new RecordError(ctx.db)

  const { page, size, ...query } = ctx.request.query
  const { start_time, end_time, uuid } = query
  const filter = new Filter()
  if (uuid) {
    filter.model.uuid = uuid
  }
  if (start_time && end_time) {
    filter.model.$and = [
      { create_time: { $gte: new Date(start_time), $lte: new Date(end_time) } }
    ]
  }
  const res = await record.pagination(Number(page), Number(size), filter)
  ctx.resBody = res
})

router.get('/record/networks', async (ctx) => {
  const record = new RecordApi(ctx.db)

  const { page, size, ...query } = ctx.request.query
  const { uuid, start_time, end_time, payload, response,send_page ,status, url } = query
  const filter = new Filter()
  filter.equal('uuid', uuid)
  filter.like('data.body', payload)
  filter.like('data.url', url)
  filter.like('data.response', response)
  filter.like('data.page', send_page)
  filter.equal('data.status', status)
  filter.rangeTime('create_time', start_time, end_time)

  const res = await record.pagination(Number(page), Number(size), filter)
  ctx.resBody = res
})

router.get('/record/networks/:id', async (ctx) => {
  const record = new RecordApi(ctx.db)
  const id = ctx.params.id
  const res = await record.findById(id)
  ctx.resBody = res
})

export default router
