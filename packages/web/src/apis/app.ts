import { request } from '@/util/request'

export type App = {
  id: string
  name: string
}
export function getAppList(params: { page: number, size: number, name?: string }) {
  return request<{ total: number, list: App[] }>({
    url: '/app/list',
    params,
    raw: 'data',
  })
}
export function updateApp(data: { name: string, id?: string }) {
  return request({
    url: '/app',
    method: data.id ? 'patch' : 'post',
    data,
  }, true)
}
export function deleteApp(appId: string) {
  return request({
    url: '/app',
    method: 'delete',
    params: { id: appId },
  }, true)
}
export function getApp(appId: string) {
  return request<App>({
    url: '/app',
    params: { id: appId },
  })
}

export function getApps() {
  return request<{ label: string, value: string }[]>({
    url: '/app/options',
    raw: 'data',
  })
}

export function readLogs(appId: string, onMessage: (evt: MessageEvent<string>) => void) {
  const token = localStorage.getItem('token')
  const source = new EventSource(`/api/logs?app=${appId}&token=${token}`)
  source.addEventListener('log', onMessage)
  return source
}

export function getAppLogs(appId: string, params: { page: number, size: number }) {
  return request<{ list: any[], total: number }>({
    url: `/app/${appId}/logs`,
    params,
    raw: 'data',
  })
}

export function getAppErrors(appId: string, params: { page: number, size: number }) {
  return request<{ list: any[], total: number }>({
    url: `/app/${appId}/errors`,
    params,
    raw: 'data',
  })
}
