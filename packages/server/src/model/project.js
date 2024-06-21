import { ObjectId } from "mongodb"
import { Filter } from "./index.js"

export class Project {
  constructor(db) {
    this.db = db
    this.col = db.collection('project')
  }

  async findOne(filter = {}) {
    const _filter = new Filter(filter)
    return await this.col.findOne(_filter.build())
  }
  async findById(id) {
    const _id = ObjectId.createFromHexString(id)
    const _filter = new Filter({ _id })
    return await this.col.findOne(_filter)
  }
  async getAll(filter = {}) {
    const _filter = new Filter(filter)
    const res = await this.col.find(_filter.build())
    return await res.toArray()
  }
  async updateOne(data) {
    const { name, id } = data
    const _id = ObjectId.createFromHexString(id)
    return await this.col.updateOne({ _id }, {
      $set: {
        name,
      }
    })
  }
  async deleteOne(id) {
    const _id = Object.createFromHexString(id)
    return await this.col.updateOne({ _id }, { $set: { is_delete: true } })
  }
  async insertOne(data) {
    const _id = Object.create()
    return await this.col.insertOne({ _id, ...data })
  }
}