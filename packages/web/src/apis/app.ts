import { request } from '@/util/request'
import type { UseWebSocketOptions } from '@vueuse/core'
import { useWebSocket } from '@vueuse/core'

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

export function readLogs(
  appId: string,
  onMessage: UseWebSocketOptions['onMessage'],
  onDisconnected: UseWebSocketOptions['onDisconnected'],
  onError: UseWebSocketOptions['onError'],
) {
  const token = localStorage.getItem('token')
  const protocol = location.protocol.startsWith('https') ? 'wss:' : 'ws:'
  const url = `${protocol}//${location.hostname}:5454/record/ws/${appId}?token=${token}`
  const websocket = useWebSocket(url, {
    heartbeat: {
      message: 'PING',
      interval: 30 * 1000,
      // pongTimeout: 10 * 1000,
    },
    onMessage,
    onDisconnected,
    onError,
  })
  if (!websocket.ws.value) return
  return websocket
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

export type AppStatistics = {
  total: number
  yesterdayTotal: number
  totalOpen: number
  yesterdayTotalOpen: number
}
export function getAppStatistics(appid: string) {
  return request<AppStatistics>({
    url: `/app/${appid}/statistics`,
  })
}

export function getAppChart(appid: string, chartType: string) {
  return request({
    url: `/app/${appid}/chart/${chartType}`,
  })
}
