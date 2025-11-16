import { Db } from "mongodb";
import { BaseType, Model } from "./index.ts";

export interface IConfig extends BaseType{
  cycle_log: number,
  cycle_api: number,
  cycle_error: number,
}

export class Config extends Model<IConfig> {
  constructor(db: Db) {
    super(db, 'common_config')
  }

  find(): Promise<IConfig | null> {
    return this.col.findOne()
  }
}