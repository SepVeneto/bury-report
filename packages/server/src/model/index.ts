import { Collection, Db, ObjectId, Filter as MongoFilter, OptionalUnlessRequiredId, WithId } from "mongodb"

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

export type ProjectionType<BaseType> = {
  [K in keyof BaseType]?: 0 | 1 | boolean
} & { id?: string }
export class Projection<M extends BaseType> {
  public projection: ProjectionType<M>
  constructor(projection: ProjectionType<M> = {}) {
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

export class Model<M extends BaseType> {
  public col: Collection<M>
  public db: Db
  constructor(db: Db, name: string) {
    this.db = db
    this.col = db.collection<M>(name)
  }

  async findOne(filter = {}) {
    const _filter = new Filter(filter)
    return await this.col.findOne(_filter.build())
  }
  async findById(id: string, projection = {}): Promise<WithId<M> | null> {
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
  async updateOne(update: {id: string } & Partial<Omit<M, 'id' | '_id' | 'is_delete'>>) {
    const { id, ...rest } = update
    const _id = ObjectId.createFromHexString(id)
    return await this.col.updateOne({ _id } as MongoFilter<M>, {
      $set: rest as unknown as  Partial<M>
    })
  }
  async deleteOne(id: string) {
    const _id = ObjectId.createFromHexString(id)
    return await this.col.updateOne({ _id } as MongoFilter<M>, { $set: { is_delete: true } as Partial<M> })
  }
  async insertOne(data: OptionalUnlessRequiredId<M>) {
    return await this.col.insertOne(data)
  }

  async pagination(page: number, size: number, filter = {}) {
    if (typeof size === 'string') {
      size = Number(size)
    }
    const skip = Math.max(0, (page - 1)) * size

    const list = await this.col.find(filter).sort({ _id: -1 }).skip(skip).limit(size).toArray()
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
      list = await this.col.find().sort({ _id: -1 }).limit(size).toArray()
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
