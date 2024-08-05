import { reportRequest as request } from '@/util/request'

export type TaskForm = {
  name: string
  trigger_id: string
  execute_time: string
  immediate: boolean
}

export function getTaskList(params: { page: number, size: number }) {
  return request({
    url: '/task/list',
    params,
    raw: 'data',
  })
}

export function createTask(data: TaskForm) {
  return request({
    url: '/task',
    method: 'post',
    data,
  }, true)
}

export function updateTask(id: string, data: TaskForm) {
  return request({
    url: '/task/' + id,
    method: 'put',
    data,
  }, true)
}

export function triggerTask(taskId: string) {
  return request({
    url: '/task/' + taskId + '/trigger',
    method: 'post',
  }, true)
}

export function stopTask(taskId: string) {
  return request({
    url: '/task/' + taskId + '/stop',
    method: 'post',
  }, true)
}

export function getTriggerList(params: { page: number, size: number}) {
  return request({
    url: '/trigger/list',
    params,
    raw: 'data',
  })
}

export type Trigger = {
  name: string,
  webhook: string
}
export function createTrigger(data: Trigger) {
  return request<string>({
    url: '/trigger',
    method: 'post',
    data,
  }, true)
}

export function updateTrigger(id: string, data: Trigger) {
  return request({
    url: '/trigger/' + id,
    method: 'put',
    data,
  }, true)
}

export function deleteTrigger(id: string) {
  return request({
    url: '/trigger/' + id,
    method: 'delete',
  }, true)
}

export function getTriggerOptions() {
  return request<Trigger[]>({
    url: '/trigger/options',
    raw: 'data',
  })
}
