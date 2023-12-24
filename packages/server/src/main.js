// const router = require('./router')
const Koa = require('koa')
const { koaBody } = require('koa-body')
const apis = require('./apis')

process.env.TZ = 'Asia/Shanghai'

const app = new Koa()
app.use(koaBody())
// app.use(router.routes())
app.use(apis.routes())
app.listen(8878, () => console.log('success...'))