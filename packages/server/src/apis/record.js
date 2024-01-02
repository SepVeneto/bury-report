const Router = require('@koa/router')
const router = new Router()
const db = require('../db')
const { PassThrough } = require('stream')

const ssePool = []
const POOL_MAX = 10

router.post('/record', async (ctx, next) => {
  let body = ctx.request.body
  if (typeof body === 'string') {
    body = JSON.parse(body)
  }
  const { appid } = body
  if (!appid) {
    await next()
    ctx.body.code = 1
    ctx.body.message = 'missing appid'
    return
  }
  const logs = db.collection('logs')
  const record = { ...body, createTime: new Date() }

  const res = await logs.insertOne({ ...record })

  const postMessage = `event: log\ndata: ${JSON.stringify(record)}\nid: ${res.insertedId}\nretry: ${20 * 1000}\n\n`
  ssePool.forEach(stream => {
    stream._appid === appid && stream.write(postMessage) 
  })

  await next()
})

router.get('/logs', async (ctx, next) => {
  const { app: id } = ctx.request.query

  if (!id) {
    await next()
    ctx.body.code = 1
    ctx.body.message = '没有找到指定应用'
    return
  }

  ctx.set({
    'Connection': 'keep-alive',
    'Cache-Control': 'no-cache',
    'Content-Type': 'text/event-stream',
  })
  const stream = new PassThrough()
  stream._appid = id

  ctx.body = stream
  ssePool.push(stream)
  if (ssePool.length > POOL_MAX) {
    const offset = ssePool.length - POOL_MAX
    ssePool.splice(0, offset)
  }
  const heartbeat = setInterval(() => {
    stream.write(`event: ping\ndata: {"time": ${new Date().toLocaleString()}}\n\n`)
  }, 5 * 1000)

  ctx.req.on('close', () => {
    clearInterval(heartbeat)
    const index = ssePool.findIndex(sse => sse === stream)
    ssePool.splice(index, 1)
  })

})

module.exports = router
