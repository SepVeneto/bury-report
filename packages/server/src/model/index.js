import { ObjectId } from "mongodb"
import db from '../db.js'

export class Filter {
  constructor(filter = {}) {
    this.filter = {
      ...filter,
      is_delete: {
        $ne: true
      }
    }
  }
  build() {
    return this.filter
  }
}
export class Projection {
  constructor(projection = {}) {
    this.projection = {
      _id: 0,
      id: '$_id',
      ...projection,
    }
  }
  build() {
    return this.projection
  }
}

export class Model{
  constructor(name) {
    this.db = db
    this.col = db.collection(name)
  }

  async findOne(filter = {}) {
    const _filter = new Filter(filter)
    return await this.col.findOne(_filter.build())
  }
  async findById(id, projection = {}) {
    const _id = ObjectId.createFromHexString(id)
    const _filter = new Filter({ _id }).build()
    const _projection = new Projection(projection).build()
    return await this.col.findOne(_filter, { projection: _projection })
  }
  async getAll(filter = {}, projection = {}) {
    const _filter = new Filter(filter)
    const _projection = new Projection(projection)
    return await this.col.find(_filter.build(), { projection: _projection.build() }).toArray()
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
    const _id = ObjectId.createFromHexString(id)
    return await this.col.updateOne({ _id }, { $set: { is_delete: true } })
  }
  async insertOne(data) {
    const _id = new ObjectId()
    return await this.col.insertOne({ _id, ...data })
  }
}
