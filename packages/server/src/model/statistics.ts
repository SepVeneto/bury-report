import { Db, Document } from "mongodb";
import { BaseType, Model } from "../model/index.ts";
import { getRecentDays } from "../utils/tools.ts";
import { RecordLog } from "./record.ts";

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

  async aggregateDevices(db: Db, limit: number) {
    const start_time = getRecentDays(limit)
    const pipeline = [
        {
            "$match": {
                "type": "__BR_COLLECT_INFO__",
                "create_time": {
                    "$lte": start_time,
                }
            },
        },
        {
            "$group": {
                "_id": {
                    "uuid": "$uuid",
                },
                "device": {"$last": "$data"},
                "total_open": {"$sum": 1},
                "last_open": {"$last": "$create_time"},
            }
        },
        {
            "$project": {
                "_id": 0,
                "uuid": "$_id.uuid",
                "total_open": 1,
                "last_open": 1,
                "data": "$device"
            }
        },
    ];
    const logs = new RecordLog(db)

    const res = await logs.findFromAggregrate(pipeline);
    res.forEach(device => {
      const filter = {
        "uuid": device.uuid
      }
      const update = {
        "$set": {
          "last_open": device.last_open,
          "data": device.data,
        },
        "$inc": {
          "total_open": device.total_open,
        }
      }

      this.col.updateOne(filter, update, { upsert: true })
    })
  }
}
