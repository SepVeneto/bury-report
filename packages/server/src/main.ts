import apis from './apis/index.ts'
import { Application } from '@oak/oak'
import process from 'node:process'
import { TaskManager } from "./utils/TaskManager.ts";
import { Cron } from "croner";
import { client } from "./db.ts";
import { Config } from "./model/config.ts";
import { App } from "./model/app.ts";
import { Db } from "mongodb";
import { RecordApi, RecordLog, RecordError } from "./model/record.ts";
import { createDebug, getRecentDays } from "./utils/tools.ts";
import { Device } from "./model/device.ts";
import { AlertError, AlertSetting } from "./model/alert.ts";
import { triggerNotify } from "./apis/alert.ts";
// import { debug } from './utils/collect.ts'

// debug()

process.env.TZ = 'Asia/Shanghai'

const app = new Application()
// app.use(router.routes())
app.use(apis.routes())
console.log('listen on 8878...')
app.listen({ port: 8878 })

initSched()


async function pushAlert() {
  const reporter = client.db('reporter')
  const app = new App(reporter)
  const res = await app.getAll()
  const appids = res.map(item => item.id)

  await Promise.all(appids.map(async (appid) => {
    const name = `app_${appid}`
    const appDb = client.db(name)
    const as = new AlertSetting(appDb)
    const { status, notify } = await as.get() || { status: false }
    if (status && notify) {
      const err = new AlertError(appDb)
      const { first, common }= await err.getPushData()
      await triggerNotify(notify, first, common)
    }
  }))
}
async function gc() {
  const log = createDebug('gc')
    log('start gc task...')
    const reporter = client.db('reporter')
    const config = new Config(reporter)
    const _config = (await config.find()) || { cycle_log: 7, cycle_api: 3, cycle_error: 30 };
    const app = new App(reporter)
    const res = await app.getAll()

    const appids = res.map(item => item.id)
    
    await Promise.all(appids.map(async (appid) => {
      const name = `app_${appid}`
      const appDb = client.db(name)
      await Promise.all([
        clearInfo(appDb, 1),
        clearApi(appDb, _config.cycle_api),
        clearError(appDb, _config.cycle_error),
        clearLog(appDb, _config.cycle_log),
      ])
    }))
}

function initSched() {
  const task = new Cron('0 0 4 * * *', async () => {
    await gc()
  })
  task.name = 'CYCLE_GC'
  TaskManager.add('CYCLE_GC', task)

  const push = new Cron('0 0 9 * * *', async () => {
    await pushAlert()
  })
  push.name = 'PUSH_ALERT'
  TaskManager.add('PUSH_ALERT', push)
}

async function clearLog(db: Db, limit: number) {
  const start_time = getRecentDays(limit)
  const logs = new RecordLog(db)
  const filter = {
    "create_time": {
      "$lte": start_time,
    }
  }
  await logs.removeMany(filter)
}

async function clearError(db: Db, limit: number) {
  const start_time = getRecentDays(limit)
  const error = new RecordError(db)
  const filter = {
    "create_time": {
      "$lte": start_time,
    },
  }
  await error.removeMany(filter)
}

async function clearApi(db: Db, limit: number) {
  const start_time = getRecentDays(limit)
  const apis = new RecordApi(db)
  const filter = {
    "create_time": {
        "$lte": start_time,
    },
  }
  await apis.removeMany(filter)
}

async function collectDevices(db: Db, limit: number) {
  const device = new Device(db)
  await device.aggregateDevices(db, limit)
}

async function clearInfo(db: Db, limit: number) {
  const start_time = getRecentDays(limit)
  console.log('collect devices...')
  await collectDevices(db, limit)
  const filter = {
    "type": "__BR_COLLECT_INFO__",
    "create_time": {
        "$lte": start_time,
    }
  }
  const logs = new RecordLog(db)
  await logs.removeMany(filter)
}
