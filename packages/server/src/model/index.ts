import { Collection, Db, ObjectId, Filter as MongoFilter, OptionalUnlessRequiredId, WithId, Document } from "mongodb"
import dayjs from 'dayjs'

export type BaseType = {
  is_delete: boolean
}

export class Filter<M extends BaseType> {
  public filter: MongoFilter<M>
  constructor(filter: MongoFilter<M> = {}) {
    this.filter = {
      ...filter,
      is_delete: {
        $ne: true
      }
    }
  }
  build() {
    return this.filter as Filter<M>
  }
}

export class Model<M extends BaseType> {
  public col: Collection<M>
  public db: Db
  constructor(db: Db, name: string) {
    this.db = db
    this.col = db.collection<M>(name)
  }

  async findOne(filter = {}) {
    const _filter = new Filter(filter)
    return processData(await this.col.findOne(_filter.build()))
  }
  async findById(id: string): Promise<WithId<M> | null> {
    const _id = ObjectId.createFromHexString(id)
    const _filter = new Filter({ _id }).build()
    return await this.col.findOne(_filter)
  }
  async getAll(filter = {}) {
    const _filter = new Filter(filter)
    return (await this.col.find(_filter.build()).toArray()).map(processData)
  }
  async updateOne(update: {id: string } & Partial<Omit<M, 'id' | '_id' | 'is_delete'>>) {
    const { id, ...rest } = update
    const _id = ObjectId.createFromHexString(id)
    return await this.col.updateOne({ _id } as MongoFilter<M>, {
      $set: { ...rest, update_time: new Date() } as unknown as  Partial<M>
    })
  }
  async deleteOne(id: string) {
    const _id = ObjectId.createFromHexString(id)
    return await this.col.updateOne({ _id } as MongoFilter<M>, { $set: { is_delete: true } as Partial<M> })
  }
  async insertOne(data: OptionalUnlessRequiredId<M>) {
    return await this.col.insertOne({ ...data, is_delete: false, create_time: new Date() })
  }

  async pagination(page: number, size: number, filter = {}) {
    if (typeof size === 'string') {
      size = Number(size)
    }
    const skip = Math.max(0, (page - 1)) * size
    const _filter = new Filter(filter)

    const list = (await this.col
      .find(_filter.build())
      .sort({ _id: -1 })
      .skip(skip)
      .limit(size)
      .toArray()).map(processData)
    const total = await this.col.countDocuments(filter)

    return {
      list,
      total
    }
  }

  async paginationWithCursor(lastId: string | null, size: number, direction: 'next' | 'prev' = 'next') {
    let list
    if (lastId) {
      if (direction === 'next') {
        const _filter = new Filter({
          _id: { $gt: ObjectId.createFromHexString(lastId) }
        })
        const res = await this.col.find(_filter.build()).limit(size).toArray()
        list = res
      } else {
        const _filter = new Filter({
          _id: { $gt: ObjectId.createFromHexString(lastId) }
        })
        const res = await this.col.find(_filter.build()).sort({ _id: 1 }).limit(size).toArray()
        res.reverse()
        list = res
      }
    } else {
      const _filter = new Filter()
      list = await this.col.find(_filter.build()).sort({ _id: -1 }).limit(size).toArray()
    }

    const hasMore = list.length === size
    const nextCursor = hasMore ? list[list.length - 1]._id.toHexString() : null
    const prevCursor = hasMore ? list[0]._id.toHexString() : null

    return {
      list,
      pagination: {
        hasMore,
        hasPrev: !!lastId,
        nextCursor,
        prevCursor
      }
    }
  }

  async findFromAggregrate(db: Db, name: string, pipeline: Document[]) {
    const res = db.collection(name).aggregate(pipeline)
    const collectData = [] 

    let record = await res.next()
    while(record) {
      collectData.push(record)
      record = await res.next()
    }

    return collectData
  }
}

function processData<T extends {
  _id: ObjectId
  create_time?: string 
  update_time?: string
  is_delete?: boolean
} | null>(data: T) {
  if (!data) {
    return
  }
  // deno-lint-ignore no-unused-vars
  const { _id, is_delete, create_time, update_time, ...rest } = data
  const res: Record<string, unknown> = rest

  if (_id) {
    res.id = _id.toHexString()
  }
  if (create_time) {
    res.create_time = dayjs(create_time).format('YYYY-MM-DD HH:mm:ss')
  }
  if (update_time) {
    res.update_time = dayjs(update_time).format('YYYY-MM-DD HH:mm:ss')
  }
  return rest
}
