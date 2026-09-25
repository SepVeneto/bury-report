import { Router } from '@oak/oak'
import { ITask, Task, TaskStatus, toString, Trigger } from "../model/task.ts";
import { TaskManager } from "../utils/index.ts";
import { Cron } from "croner";
import { v4 as uuidv4 } from 'uuid'
import { Db } from "mongodb";
import { createDebug } from "../utils/tools.ts";
import { Filter } from "../model/index.ts";
import dayjs from "dayjs";

const log = createDebug('task')

const router = new Router()

/** 任务 id 是 Mongo ObjectId 的 hex，非法 id 直接当业务错误处理，避免 createFromHexString 抛异常变成 500 */
function isValidId(id?: string) {
  return !!id && /^[0-9a-f]{24}$/i.test(id)
}

router.post('/trigger', async (ctx) => {
  const task = new Trigger(ctx.db)

  const { name, webhook } = await ctx.request.body.json()

  await task.insertOne({
    name,
    webhook,
    is_delete: false,
  })

  ctx.resMsg = '创建成功'
})

router.put('/trigger/:triggerId', async (ctx) => {
  const task = new Trigger(ctx.db)

  const { name, webhook } = await ctx.request.body.json()
  const triggerId = ctx.params.triggerId
  await task.updateOne({ id: triggerId, name, webhook })

  ctx.resMsg = '修改成功'
})

router.delete('/trigger/:triggerId', async (ctx) => {
  const trigger= new Trigger(ctx.db)

  const triggerId = ctx.params.triggerId

  await trigger.deleteOne(triggerId)
  ctx.resMsg = '删除成功'
})

router.get('/trigger/list', async (ctx) => {
  const task = new Trigger(ctx.db)

  const { page, size } = ctx.request.query
  const res = await task.pagination(page, size)
  ctx.resBody = res
})

router.get('/trigger/options', async (ctx) => {
  const task = new Trigger(ctx.db)

  const res = await task.getAll()
  ctx.resBody = res
})

router.post('/task', async (ctx) => {
  const task = new Task(ctx.db)

  const {
    name,
    trigger_id,
    execute_time,
    notify_id,
    immediate,
  } = await ctx.request.body.json()

  // 没有触发器/执行时间的任务跑不起来，先拦掉，避免落一条永远不执行的脏数据
  if (!trigger_id) {
    ctx.resCode = 1
    ctx.resMsg = '请选择触发器'
    return
  }
  if (!immediate && !execute_time) {
    ctx.resCode = 1
    ctx.resMsg = '缺少执行时间'
    return
  }

  const res = await task.insertOne({
    name,
    trigger_id,
    notify_id,
    execute_time,
    status: TaskStatus.Pending,
    is_delete: false,
  })

  const oid = res.insertedId.toHexString()
  if (immediate) {
    await issue(ctx.db, oid)
  } else {
    // 先落库再注册定时器：定时器触发时要靠 job_id 摘掉自己，
    // 如果此时 job_id 还没写入，任务执行后会残留在 TaskManager 里
    const jobId = uuidv4()
    await task.updateOne({ id: oid, job_id: jobId })
    scheduleTask(ctx.db, oid, execute_time, jobId)
  }
})

router.put('/task/:taskId', async (ctx) => {
  const task = new Task(ctx.db)

  const taskId = ctx.params.taskId

  const data = await ctx.request.body.json()
  const { immediate, job_id: bodyJobId, ...rest } = data

  if (!isValidId(taskId)) {
    ctx.resCode = 1
    ctx.resMsg = '任务不存在'
    return
  }

  const exist = await task.findById(taskId)
  if (!exist) {
    ctx.resCode = 1
    ctx.resMsg = '任务不存在'
    return
  }

  // 不管是改成立即执行还是改执行时间，都要先摘掉旧定时器，
  // 否则旧任务会继续在原定时间触发，导致同一个任务被重复下发
  if (exist.job_id) {
    TaskManager.remove(exist.job_id)
  }
  if (bodyJobId && bodyJobId !== exist.job_id) {
    TaskManager.remove(bodyJobId)
  }

  if (immediate) {
    await task.updateOne({ ...rest, id: taskId, job_id: undefined })
    await issue(ctx.db, taskId)
  } else {
    if (!rest.execute_time) {
      ctx.resCode = 1
      ctx.resMsg = '缺少执行时间'
      return
    }
    const jobId = bodyJobId || uuidv4()
    await task.updateOne({ ...rest, id: taskId, job_id: jobId, status: TaskStatus.Pending })
    scheduleTask(ctx.db, taskId, rest.execute_time, jobId)
  }
  log('当前任务列表：', TaskManager.names)
  ctx.resMsg = '修改成功'
})

router.post('/task/:taskId/stop', async (ctx) => {
  const task = new Task(ctx.db)

  const taskId = ctx.params.taskId

  const data = await ctx.request.body.json().catch(() => {
    // without body
    return { operator: '' }
  })

  try {
    if (!isValidId(taskId)) {
      ctx.resCode = 1
      ctx.resMsg = '任务不存在'
      return
    }

    const res = await task.findById(taskId)
    if (!res) {
      ctx.resCode = 1
      ctx.resMsg = '任务不存在'
      return
    }

    // 是否可中止只看任务状态，不看内存里有没有定时器：
    // 任务跑完会把 job_id 清空，历史数据/重启后的任务也可能没有 job_id，
    // 这些任务同样要能被中止，而不是把"没有 job_id"当成错误
    const finished: TaskStatus[] = [TaskStatus.Success, TaskStatus.Fail, TaskStatus.Abort]
    if (finished.includes(res.status)) {
      ctx.resMsg = '任务未在运行'
      return
    }

    // 有定时器就摘掉，没有（job_id 为空）也要把任务状态置为已中止
    if (res.job_id) {
      TaskManager.remove(res.job_id)
    }
    await task.updateOne({
      id: taskId,
      job_id: undefined,
      status: TaskStatus.Abort,
      operator: data?.operator,
    })
    ctx.resMsg = '任务已停止'
  } catch (err) {
    // 兜底：中止失败也不能以 500 的形式抛给前端，把原因带上便于定位
    console.error('[task] 中止任务失败:', err)
    ctx.resCode = 1
    ctx.resMsg = `中止失败：${err instanceof Error ? err.message : String(err)}`
  }
})

router.post('/task/:taskId/trigger', async (ctx) => {
  const taskId = ctx.params.taskId

  await issue(ctx.db, taskId)
})

router.get('/task/list', async (ctx) => {
  const task = new Task(ctx.db)

  const { page, size, name } = ctx.request.query
  const filter = new Filter()
  filter.like('name', name)

  const res = await task.pagination(page, size, { filter })
  ctx.resBody = res
})

export default router

/**
 * 注册一次性定时任务。jobId 同时作为 TaskManager 的 key 和落库的 job_id，
 * 保证任务触发时能通过 job_id 找到并摘掉自己
 */
export function scheduleTask(
  db: Db,
  taskId: string,
  executeTime: string,
  jobId: string = uuidv4(),
) {
  const cron = new Cron(executeTime, () => {
    // croner 不会消费回调返回的 promise，异常必须自己兜住，
    // 否则会变成 unhandledRejection 且任务状态停在 pending
    issue(db, taskId).catch(err => {
      console.error('[task] 定时任务执行异常:', err)
    })
  })
  cron.name = jobId
  TaskManager.add(jobId, cron)
  return jobId
}

/**
 * 服务重启后 TaskManager 是空的，重启前排期的任务不会再被执行；
 * 这里把这些任务记录一并清掉，避免列表里残留永远不会执行的 pending 任务
 */
export async function clearTasks(
  db: Db,
  log: (...args: unknown[]) => void = () => { },
) {
  const task = new Task(db)
  const res = await task.col.updateMany(
    { is_delete: { $ne: true } },
    {
      $set: {
        is_delete: true,
        update_time: new Date(),
      } as unknown as Partial<ITask>,
    },
  )
  if (res.modifiedCount) {
    log(`已清空重启前的定时任务 ${res.modifiedCount} 条`)
  }
  return res.modifiedCount
}

async function issue(
  db: Db,
  taskId: string
) {
  const task = new Task(db)
  const trigger = new Trigger(db)
  const taskRes = await task.findById(taskId)
  if (!taskRes) {
    throw new Error('任务不存在')
  }
  const jobId = taskRes.job_id
  if (jobId) {
    // 手动触发或定时触发都先摘掉待执行的定时器，避免同一个任务被重复下发
    TaskManager.remove(jobId)
  }

  const tri = taskRes.trigger_id ? await trigger.findById(taskRes.trigger_id) : null
  const notify = taskRes.notify_id ? await trigger.findById(taskRes.notify_id) : null

  if (!tri) {
    throw new Error('触发器不存在')
  }

  try {
    await triggerWebhook(tri.webhook)
    if (notify) {
      await triggerNotify(notify.webhook, { name: taskRes.name }, TaskStatus.Success)
    }
    await task.updateOne({
      id: taskId,
      job_id: undefined,
      status: TaskStatus.Success,
      execute_time: dayjs().format('YYYY-MM-DD HH:mm:ss'),
    })
  } catch (e) {
    console.error(e)
    if (notify) {
      await triggerNotify(notify.webhook, { name: taskRes.name }, TaskStatus.Fail).catch(() => { })
    }
    await task.updateOne({
      id: taskId,
      job_id: undefined,
      status: TaskStatus.Fail,
      execute_time: dayjs().format('YYYY-MM-DD HH:mm:ss'),
    })
  }
}

async function triggerWebhook(
  webhook: string,
) {
  await fetch(webhook, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({}),
  }).catch(err => {
    throw err
  })
}

async function triggerNotify(
  webhook: string,
  task: { name: ITask['name'] },
  status: TaskStatus,
) {
  const statusMsg = {
    [TaskStatus.Fail]: "❌",
    [TaskStatus.Success]: "✅",
    [TaskStatus.Abort]: '',
    [TaskStatus.Pending]: '',
  }[status]
  const data = {
    "msgtype": "markdown",
    "markdown": {
      "content": `<font color=\"info\">**任务下发通知**</font>\n**名称**：${task.name}\n**下发结果**：${statusMsg}${toString(status)}`,
    }
  }


  await fetch(webhook, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(data),
  }).catch(err => {
    throw err
  })
}
