const { MongoClient } = require('mongodb')

// const client = new MongoClient('mongodb://db:27017')
const client = new MongoClient(`mongodb://${process.env.DB_NAME || 'root'}:${process.env.DB_PWD || 'root_123'}@${process.env.REPORT_DB_URL}`)

const db = client.db('reporter')

initDb()

module.exports = db

async function initDb() {
  await client.connect()
  const collections = await db.listCollections().toArray()
  createCollection('captcha', collections)
  createCollection('apps', collections)
  createCollection('projects', collections)
  createCollection('users', collections)
  createCollection('logs', collections)
  {
    const captcha = db.collection('captcha')
    const exist = (await captcha.indexes()).find(index => index.name === 'createTime')
    if (!exist) {
      captcha.createIndex({ 'createTime': 1 }, { name: 'createTime', expireAfterSeconds: 10 * 60 })
    }
  }
  {
    const logs = db.collection('logs')
    const exit = (await logs.indexes()).find(index => index.name === 'uuid')
    if (!exit) {
      logs.createIndex({ 'data.uuid': 1 }, { name: 'uuid' })
    }
  }
}

function createCollection(name, collections) {
  const exist = collections.find(collection => collection.name === name)
  if (!exist) {
    db.createCollection(name)
  }
}
