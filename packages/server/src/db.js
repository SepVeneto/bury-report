const { MongoClient } = require('mongodb')

// const client = new MongoClient('mongodb://127.0.0.1:27017')
const client = new MongoClient('mongodb://10.7.12.26:27017')

client.connect()

const db = client.db('reporter')

module.exports = db