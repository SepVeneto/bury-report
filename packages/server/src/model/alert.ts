import { Db } from "mongodb";
import { Filter, BaseType, Model } from "./index.ts";
import Dayjs from "dayjs";

// TODO: 与web统一类型来源
export type AlertType = 'error' | 'api' | 'log'
export interface IAlert extends BaseType {
  name: string,
  enabled: boolean,
  strategy?: 'once' | 'window' | 'limit',
  source: {
    type: 'collection' | 'fingerprint',
    // 集合类型，错误触发，接口超时，自定义日志主动告警
    log_type?: AlertType,
    fingerprint?: string,
  },
  notify: {
    // 告警窗口，单位秒。也就是下一次会发送告警的时间
    window_sec: number,
    // 告警阈值，即窗口期内到达阈值时，开始发送告警
    limit: number,
  }
}

export class Alert extends Model<IAlert> {
  constructor(db: Db) {
    super(db, 'alert_rule')
  }
}

export interface IAlertError extends BaseType {

}
export class AlertError extends Model<IAlertError> {
  constructor(db: Db) {
    super(db, 'history_error')
  }

  async getPushData() {
    const start = Dayjs().subtract(1, 'day').startOf('day').toDate()
    const end = Dayjs().startOf('day').toDate()
    const firstList = await this.col.find({
      first_seen: { $gte: start, $lt: end },
    }).toArray()
    const commonList = await this.col.find({
      last_seen: { $gte: start, $lt: end },
    }).toArray()
    return {
      first: firstList,
      common: commonList,
    }
  }
}

export interface IConfig extends BaseType {
  scope: 'alert_setting'
  notify?: string
  status: boolean
}
export class AlertSetting extends Model<IConfig> {
  constructor(db: Db) {
    super(db, 'app_config')
  }

  async get() {
    const filter = new Filter()

    filter.equal('scope', 'alert_setting')

    const res = await this.col.findOne(filter.build(), { projection: { scope: 0 }})
    return res
  }
  set(res: Omit<IConfig, 'scope'>) {
    return this.col.updateOne(
      { scope: 'alert_setting' },
      { $set: res },
      { upsert: true }
    )
  }
}
