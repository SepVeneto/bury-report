import { CollectionInfo, MongoClient } from 'mongodb'
import process from "node:process"

// const client = new MongoClient('mongodb://db:27017')
export const client = new MongoClient(`mongodb://${process.env.DB_NAME || 'root'}:${process.env.DB_PWD || 'root_123'}@${process.env.REPORT_DB_URL}`)


const db = client.db('reporter')
init()

function init() {
  initClient()
  initDb()
}

async function initClient() {
  const apps = await client.db().admin().listDatabases()
  apps.databases.forEach(async db => {
    if (db.name.startsWith('app_')) {
      const app = client.db(db.name)
      const cols = await app.listCollections().toArray()
      cols.forEach(col => {
        const inst = app.collection(col.name)
        inst.createIndexes([{ key: { uuid: 1 }}, { key: { session: 1 }}])
      })
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
