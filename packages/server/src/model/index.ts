import { Collection, Db, ObjectId } from "mongodb"
import db from '../db.ts'

export class Filter {
  public filter
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
  public projection
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
  public col: Collection
  public db: Db
  constructor(name: string) {
    this.db = db
    this.col = db.collection(name)
  }

  async findOne(filter = {}) {
    const _filter = new Filter(filter)
    return await this.col.findOne(_filter.build())
  }
  async findById(id: string, projection = {}) {
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
  async updateOne(data: { name: string, id: string }) {
    const { name, id } = data
    const _id = ObjectId.createFromHexString(id)
    return await this.col.updateOne({ _id }, {
      $set: {
        name,
      }
    })
  }
  async deleteOne(id: string) {
    const _id = ObjectId.createFromHexString(id)
    return await this.col.updateOne({ _id }, { $set: { is_delete: true } })
  }
  async insertOne(data: object) {
    const _id = new ObjectId()
    return await this.col.insertOne({ _id, ...data })
  }
}
