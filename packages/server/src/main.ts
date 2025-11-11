import apis from './apis/index.ts'
import { Application } from '@oak/oak'
import process from 'node:process'

process.env.TZ = 'Asia/Shanghai'

const app = new Application()
// app.use(router.routes())
app.use(apis.routes())
console.log('listen on 8878...')
app.listen({ port: 8878 })