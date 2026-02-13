import { MongoClient } from 'mongodb'
import process from "node:process"

// const client = new MongoClient('mongodb://db:27017')
export const client = new MongoClient(`mongodb://${process.env.DB_NAME || 'root'}:${process.env.DB_PWD || 'root_123'}@${process.env.REPORT_DB_URL}`)
