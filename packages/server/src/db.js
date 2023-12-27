const { MongoClient } = require('mongodb')

// const client = new MongoClient('mongodb://db:27017')
const client = new MongoClient(`mongodb://${process.env.DB_NAME || 'admin'}:${process.env.DB_PWD || 'admin_123'}@${process.env.REPORT_DB_URL}`)

initDb()

const db = client.db('reporter')

module.exports = db

async function initDb() {
  db.createCollection('captcha')
  db.createCollection('apps')
  db.createCollection('projects')
  db.createCollection('users')
  db.createCollection('logs')
  await client.connect()
  const captcha = db.collection('captcha')
  const exist = (await captcha.indexes()).find(index => index.name === 'createTime')
  if (!exist) {
    captcha.createIndex({ 'createTime': 1 }, { name: 'createTime', expireAfterSeconds: 10 * 60 })
  }
}
