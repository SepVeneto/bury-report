import { Db } from "mongodb";
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
}

export class RecordApi extends Model<IRecord> {
  constructor(db: Db) {
    super(db, 'records_api')
  }
}

export class RecordError extends Model<IRecord> {
  constructor(db: Db) {
    super(db, 'records_err')
  }
}

export class RecordTrack extends Model<IRecord> {
  constructor(db: Db) {
    super(db, 'records_track')
  }
}
