import { Db } from "mongodb";
import { BaseType, Model } from "./index.ts";

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