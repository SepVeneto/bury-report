const { MongoClient } = require('mongodb')

// const client = new MongoClient('mongodb://db:27017')
const client = new MongoClient(`mongodb://${process.env.REPORT_DB_URL}`)

client.connect()

const db = client.db('reporter')

module.exports = db
