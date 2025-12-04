import { Db, Document } from "mongodb";
import { BaseType, Model } from "../model/index.ts";

export interface RulePie {
  type: 'Pie'
  name: string,
  source: string,
  dimension: string,
  sort: string,
}

export interface IStatistics extends BaseType {
  type: 'Pie',
  data: RulePie,
  cache: { name: string, value: number }[]
}

export class Statistics extends Model<IStatistics> {
  constructor(db: Db) {
    super(db, 'statistics')
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
