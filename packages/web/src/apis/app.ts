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
