import Koa from 'koa'
import { koaBody } from 'koa-body'
import apis from './apis/index.js'

process.env.TZ = 'Asia/Shanghai'

const app = new Koa()
app.use(koaBody())
// app.use(router.routes())
app.use(apis.routes())
app.listen(8878, () => console.log('listen on 8878...'))