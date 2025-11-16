import { Db } from "mongodb";
import { BaseType, Model } from "./index.ts";

export enum TaskStatus {
  Success = 'success',
  Abort = 'abort',
  Fail = 'fail',
  Pending = 'pending',
}

export function toString(status: TaskStatus) {
  switch (status) {
    case TaskStatus.Success:
      return '成功'
    case TaskStatus.Abort:
      return '取消'
    case TaskStatus.Fail:
      return '失败'
    case TaskStatus.Pending:
      return '待执行'
  }
}

export interface ITask extends BaseType {
  name: string,
  trigger_id: string,
  execute_time?: string,
  job_id?: string,
  status: TaskStatus,
  notify_id?: string,
}

export class Task extends Model<ITask> {
  constructor(db: Db) {
    super(db, 'app_task')
  }
}


export interface ITrigger extends BaseType {
  name: string,
  webhook: string,
}
export class Trigger extends Model<ITrigger> {
  constructor(db: Db) {
    super(db, 'app_trigger')
  }
}
