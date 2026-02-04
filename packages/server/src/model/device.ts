import { Db } from "mongodb";
import { BaseType, Model } from "./index.ts";
import { getRecentDays } from "../utils/tools.ts";
import { RecordLog } from "./record.ts";

export interface IDevice extends BaseType {
  uuid: string,
  ip?: string,
  data: object,
  last_open: Date,
  total_open: number,
}

export class Device extends Model<IDevice> {
  constructor(db: Db) {
    super(db, 'statistic_device')
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

export class DeviceLog extends Model<IDevice> {
  constructor(db: Db) {
    super(db, 'records_device')
  }
}

export interface ISession extends BaseType {
  event_urls?: string[],
}

export class Session extends Model<ISession> {
  constructor(db: Db) {
    super(db, 'records_session')
  }
}

export interface IMpTrack extends BaseType {
}
export class MpTrack extends Model<IMpTrack> {
  constructor(db: Db) {
    super(db, 'records_mp_track')
  }
}