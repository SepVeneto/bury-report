import { reportRequest as request } from '@/util/request'

export function getTaskList(params: { page: number, size: number }) {
  return request({
    url: '/task/list',
    params,
    raw: 'data',
  })
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
  })
}
