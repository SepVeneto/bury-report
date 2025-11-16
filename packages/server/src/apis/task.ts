import { Router } from '@oak/oak'
import { ITask, Task, TaskStatus, toString, Trigger } from "../model/task.ts";
import { TaskManager } from "../utils/index.ts";
import { Cron } from "croner";
import { v4 as uuidv4 } from 'uuid'
import { Db } from "mongodb";

const router = new Router()

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

  const { page, size, ...query } = ctx.request.query
  const res = await task.pagination(page, size, query)
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
    // TODO: 时间校准
    const jobId = uuidv4()
    const cron = new Cron(execute_time, () => {
      issue(ctx.db, oid)
    })
    TaskManager.add(jobId, cron)
    task.updateOne({ id: oid, job_id: jobId })
  }
})

router.put('/task/:taskId', async (ctx) => {
  const task = new Task(ctx.db)

  const taskId = ctx.params.taskId

  const data = await ctx.request.body.json()
  const jobId = data.job_id || uuidv4()
  if (data.immediate) {
    await task.updateOne({ ...data, id: taskId })
    await issue(ctx.db, taskId)
  } else {
    data.job_id && TaskManager.remove(data.job_id)
    // TODO: 时间校准
    const cron = new Cron(data.execute_time, () => {
      issue(ctx.db, taskId)
    })
    TaskManager.add(jobId, cron)
    await task.updateOne({ ...data, id: taskId, job_id: jobId, status: TaskStatus.Pending })
  }
  ctx.resMsg = '修改成功'
})

router.post('/task/:taskId/stop', async (ctx) => {
  const task = new Task(ctx.db)

  const taskId = ctx.params.taskId
  const res = await task.findById(taskId)
  if (!res?.job_id) {
    throw new Error('任务未运行')
  }
  TaskManager.remove(res.job_id)
  task.updateOne({ id: taskId, job_id: undefined, status: TaskStatus.Abort })
  ctx.resMsg = '任务已停止'
})

router.post('/task/:taskId/trigger', async (ctx) => {
  const taskId = ctx.params.taskId

  await issue(ctx.db, taskId)
})

router.get('/task/list', async (ctx) => {
  const task = new Task(ctx.db)

  const { page, size, ...query } = ctx.request.query
  const res = await task.pagination(page, size, query)
  ctx.resBody = res
})

export default router

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
    TaskManager.remove(jobId)
  }

  const tri = await trigger.findById(taskRes.trigger_id)
  const notify = taskRes?.notify_id ? await trigger.findById(taskRes.notify_id) : null

  if (!tri) {
    throw new Error('触发器不存在')
  }

  try {
    await triggerWebhook(tri.webhook, { name }, )
    if (notify) {
      await triggerNotify(notify.webhook, { name }, TaskStatus.Success)
    }
    task.updateOne({ id: taskId, job_id: undefined, status: TaskStatus.Success })
  } catch (e) {
    console.error(e)
    if (notify) {
      await triggerNotify(notify.webhook, { name }, TaskStatus.Fail).catch(() => { })
    }
    task.updateOne({ id: taskId, job_id: undefined, status: TaskStatus.Fail })
  }
}

async function triggerWebhook(
  webhook: string,
  task: { name: ITask['name'] },
) {
  const data = {
    "msgtype": "text",
    "text": {
        "content": task.name,
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


  const res = await fetch(webhook, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(data),
  }).catch(err => {
    throw err
  })
  console.log(res)
}

