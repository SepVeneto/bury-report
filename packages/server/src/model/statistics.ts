import { Db } from "mongodb";
import { BaseType, Model } from "../model/index.ts";

export interface IStatistics extends BaseType {

}

export class Statistics extends Model<IStatistics> {
  constructor(db: Db) {
    super(db, 'statistics')
  }
}