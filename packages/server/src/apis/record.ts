import { Router } from '@oak/oak'
import { RecordApi, RecordError, RecordLog } from "../model/record.ts";
import { Filter } from "../model/index.ts";

const router = new Router()

router.get('/record/logs', async (ctx) => {
  const record = new RecordLog(ctx.db)

  const { page, size, ...query } = ctx.request.query
  const { uuid, data, type, session, start_time, end_time } = query

  const filter = new Filter()
  filter.equal('session', session)
  filter.equal('uuid', uuid)
  filter.like('type', type)
  filter.like('data', data)
  filter.rangeTime('create_time', start_time, end_time)
  filter.model.type = {
    "$nin": ["__BR_COLLECT_INFO__", "__BR_TRACK_EVENT__"]
  }

  // if (data) {
  //   filter.model.$and?.push({
  //     data: { $regex: data }
  //   })
  // }

  const res = await record.pagination(
    Number(page),
    Number(size),
    { filter, count: false },
  )
  ctx.resBody = res
})

router.get('/record/errors', async (ctx) => {
  const record = new RecordError(ctx.db)

  const { page, size, ...query } = ctx.request.query
  const { start_time, end_time, uuid, session, fingerprint } = query
  const filter = new Filter()
  filter.equal('fingerprint', fingerprint)
  filter.equal('uuid', uuid)
  filter.rangeTime('create_time', start_time, end_time)
  filter.equal('session', session)
  const res = await record.pagination(
    Number(page),
    Number(size),
    { filter, count: false }
  )
  ctx.resBody = res
})

router.get('/record/networks', async (ctx) => {
  const record = new RecordApi(ctx.db)

  const { page, size, ...query } = ctx.request.query
  const { uuid, start_time, end_time, payload, response,send_page ,status, url, session } = query
  const filter = new Filter()
  filter.equal('uuid', uuid)
  filter.like('data.body', payload)
  filter.like('data.url', url)
  filter.like('data.response', response)
  filter.like('data.page', send_page)
  filter.equal('data.status', Number(status))
  filter.rangeTime('create_time', start_time, end_time)
  filter.equal('session', session)

  const res = await record.pagination(
    Number(page),
    Number(size),
    { filter, count: false },
  )
  res.list.forEach(item => {
    // @ts-expect-error: ignore
    delete item.data.response
    // @ts-expect-error: ignore
    delete item.data.body
    // @ts-expect-error: ignore
    delete item.data.responseHeaders
    // @ts-expect-error: ignore
    delete item.data.profile
  })
  ctx.resBody = res
})

router.get('/record/networks/:id', async (ctx) => {
  const record = new RecordApi(ctx.db)
  const id = ctx.params.id
  const res = await record.findById(id)
  ctx.resBody = res
})

export default router
