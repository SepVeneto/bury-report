import apis from './apis/index.ts'
import { Application } from '@oak/oak'
import process from 'node:process'
import { TaskManager } from "./utils/TaskManager.ts";
import { Cron } from "croner";
import { client } from "./db.ts";
import { Config } from "./model/config.ts";
import { App } from "./model/app.ts";
import { Db } from "mongodb";

process.env.TZ = 'Asia/Shanghai'

const app = new Application()
// app.use(router.routes())
app.use(apis.routes())
console.log('listen on 8878...')
app.listen({ port: 8878 })

initSched()

function initSched() {
  TaskManager.add('NETWORK_GC', new Cron('0 0 16 1/1 * *', async () => {
    const reporter = client.db('reporter')
    const config = new Config(reporter)
    const _config = await config.find();
    const app = new App(reporter)
    const res = await app.getAll()
  }))
}
