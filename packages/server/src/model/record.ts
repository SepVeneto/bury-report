import { Db, Document } from "mongodb";
import { BaseType, Model } from "./index.ts";

export interface IRecord extends BaseType {
  type: string,
  appid: string,
  data: object,
  uuid: string,
  session?: string,
  time?: string,
}

export class RecordLog extends Model<IRecord> {
  constructor(db: Db) {
    super(db, 'records_log')
  }
  removeMany(filter: object) {
    return this.col.deleteMany(filter)
  }

  async findFromAggregrate(pipeline: Document[]) {
    const res = this.col.aggregate(pipeline)
    const collectData = [] 

    let record = await res.next()
    while(record) {
      collectData.push(record)
      record = await res.next()
    }

    return collectData
  }
}

export class RecordApi extends Model<IRecord> {
  constructor(db: Db) {
    super(db, 'records_api')
  }

  removeMany(filter: object) {
    return this.col.deleteMany(filter)
  }
}

export class RecordError extends Model<IRecord> {
  constructor(db: Db) {
    super(db, 'records_err')
  }

  removeMany(filter: object) {
    return this.col.deleteMany(filter)
  }
}

export class RecordTrack extends Model<IRecord> {
  constructor(db: Db) {
    super(db, 'records_track')
  }
}
