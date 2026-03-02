import { CollectionInfo, Db, MongoClient } from 'mongodb'
import process from "node:process"

// const client = new MongoClient('mongodb://db:27017')
export const client = new MongoClient(`mongodb://${process.env.DB_NAME || 'root'}:${process.env.DB_PWD || 'root_123'}@${process.env.REPORT_DB_URL}`)


const db = client.db('reporter')
init()

function init() {
  initClient()
  initDb()
}

export async function initApp(db: Db) {
  {
    const futures = [
      'records_api',
      'records_log',
      'records_track',
      'records_session'
    ].map(name => {
      const col = db.collection(name)
      return col.createIndexes([{ key: { uuid: 1, }}, { key: { session: 1 }}])
    })
    await Promise.all(futures)
  }

  {
    const col = db.collection('records_err')
    await col.createIndexes([{ key: { uuid: 1, }}, { key: { session: 1 }}, { key: { fingerprint: 1 }}])
  }

  {
    const futures = [
      'alert_rule',
      'history_error',
    ].map(name => {
      const col = db.collection(name)
      return col.createIndexes([{ key: { fingerprint: 1, }}])
    })
    await Promise.all(futures)
  }

  {
    const col = db.collection('alert_fact')
    await col.createIndexes([
      { key: { fingerpring: 1 }},
      // 超过7天仍不活跃的事实可以被删除
      // 因此告警阈值的时间窗口最大不能超过24小时
      { key: { last_seen: 1 }, expireAfterSeconds: 60 * 60 * 24 * 7 },
    ]).catch(err => {
      console.error(err)
    })
  }
}
async function initClient() {
  const apps = await client.db().admin().listDatabases()
  apps.databases.forEach(db => {
    if (db.name.startsWith('app_')) {
      const app = client.db(db.name)
      initApp(app)
    }
  })
}

async function initDb() {
  await client.connect()
  const collections = await db.listCollections().toArray()
  createCollection('captcha', collections)
  createCollection('apps', collections)
  createCollection('projects', collections)
  createCollection('users', collections)
  // createCollection('logs', collections)
  {
    const captcha = db.collection('captcha')
    const indexs = await captcha.indexes()
    const exist = indexs.find(index => index.name === 'create_time')
    if (!exist) {
      captcha.createIndex({ 'create_time': 1 }, { name: 'create_time', expireAfterSeconds: 10 * 60 })
    }
  }
}

function createCollection(name: string, collections: (CollectionInfo| Pick<CollectionInfo, "name" | "type">)[]) {
  const exist = collections.find(collection => collection.name === name)
  if (!exist) {
    db.createCollection(name)
  }
}
