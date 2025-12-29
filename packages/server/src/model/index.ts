import { Collection, Db, ObjectId, Filter as MongoFilter, OptionalUnlessRequiredId, WithId} from "mongodb"
import dayjs from 'dayjs'
import { escapeRegExp } from "../utils/tools.ts";

export type BaseType = {
  is_delete: boolean
}

export class Filter<M extends BaseType> {
  public model: MongoFilter<M>
  constructor(filter: MongoFilter<M> = {}) {
    this.model = {
      ...filter,
      is_delete: {
        $ne: true
      }
    }
  }
  rangeTime(key: string, from?: string, to?: string) {
    if (!from && !to) return

    Object.assign(this.model, { [key]: {} })
    if (from) {
      Object.assign(this.model[key], { $gte: dayjs(from).toDate() })
    }
    if (to) {
      Object.assign(this.model[key], { $lte: dayjs(to).toDate() })
    }
  }
  equal(key: string, value?: string | number) {
    if (!value) return
    Object.assign(this.model, { [key]: value })
  }
  like(key: string, value?: string) {
    if (!value) return
    Object.assign(this.model, { [key]: { $regex: escapeRegExp(value) }})
  }
  build() {
    return this.model as Filter<M>
  }
}

export class Model<M extends BaseType> {
  public col: Collection<M>
  public db: Db
  constructor(db: Db, name: string) {
    this.db = db
    this.col = db.collection<M>(name)
  }

  async findOne(filter: Filter<M>) {
    const res = await this.col.findOne(filter.build())
    if (!res) return

    return processData(res)
  }
  async findById(id: string): Promise<WithId<M> | null> {
    const _id = ObjectId.createFromHexString(id)
    const _filter = new Filter({ _id }).build()
    return await this.col.findOne(_filter)
  }
  async getAll(filter: Filter<M> = new Filter()) {
    return (await this.col.find(filter.build()).toArray()).map(processData)
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

  async pagination(
    page: number,
    size: number,
    filter: Filter<M> = new Filter(),
  ) {
    if (typeof size === 'string') {
      size = Number(size)
    }
    const skip = Math.max(0, (page - 1)) * size

    const _filter = filter.build()
    const list = (await this.col
      .find(_filter)
      .sort({ _id: -1 })
      .skip(skip)
      .limit(size)
      .toArray()).map(processData)
    const total = await this.col.countDocuments(_filter)

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
}

function processData<T extends {
  _id: ObjectId
  create_time?: string 
  update_time?: string
  is_delete?: boolean
}>(data: T) {
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
