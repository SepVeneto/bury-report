import { Db } from "mongodb";
import { BaseType, Model } from "./index.ts";

export interface IDevice extends BaseType {
  uuid: string,
  data: object,
  last_open: Date,
  total_open: number,
}

export class Device extends Model<IDevice> {
  constructor(db: Db) {
    super(db, 'statistic_device')
  }
}