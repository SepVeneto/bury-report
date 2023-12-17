const router = require('./router')
const Koa = require('koa')

const app = new Koa()
app.use(router.routes())
app.listen(8878, () => console.log('success...'))