import { reportRequest as request } from '@/util/request'
import type { UseWebSocketOptions } from '@vueuse/core'
import { useWebSocket } from '@vueuse/core'
import { Query } from '.'

export type App = {
  id: string
  name: string
  icon?: string
}
export function getAppList(params: { page: number, size: number, name?: string }) {
  return request<{ total: number, list: App[] }>({
    url: '/app/list',
    params,
    raw: 'data',
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
  const host = import.meta.env.MODE === 'production'
    ? `${protocol}//${location.hostname}`
    : `${protocol}//${location.hostname}:5454`
  const url = `${host}/api/record/ws/${appId}?token=${token}`
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

export function getAppErrors(params: { page: number, size: number, timerange?: string[] }) {
  const _params = new Query(params).build()
  return request<{ list: any[], total: number }>({
    url: '/record/errors',
    params: _params,
    raw: 'data',
  })
}

export function getAppNetworks(params: { page: number, size: number, timerange?: string[]}) {
  const _params = new Query(params).build()
  return request({
    url: '/record/networks',
    params: _params,
    raw: 'data',
  })
}

export function getAppNetworkDetail(id: string) {
  console.log(id)
  return request({
    url: `/record/networks/${id}`,
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

type DeviceCommon = {
  /**
   * 设备类型
   */
  dt: 'phone' | 'pad' | 'pc'
  /**
   * 设备品牌
   */
  db?: string
  /**
   * 设备型号
   */
  dm: string
  /**
   * 设备像素比
   */
  dp: string
  /**
   * 设备方向
   */
  do: 'portrait' | 'landscape'
  /**
   * 系统名称
   */
  on: 'ios' | 'android' | 'windows' | 'mac' | 'linux'
  /**
   * 系统版本
   */
  ov: string
  /**
   * 浏览器名称
   */
  bn: string
  /**
   * 浏览器版本
   */
  bv: string
  /**
   * 用户标识
   */
  ua: string
}
type DeviceScreen = {
  /**
   * 可用窗口底部位置
   */
  wb: number
  /**
   * 可用窗口顶部位置
   */
  wt: number
  /**
   * 可用窗口宽度
   */
  ww: number
  /**
   * 可用窗口高度
   */
  wh: number
  /**
   * 屏幕宽度
   */
  sw: number
  /**
   * 屏幕高度
   */
  sh: number
  /**
   * 状态栏高度
   */
  sbh: number
  /**
   * 在竖屏正方向下的安全区域插入位置
   */
  sa: {
      /**
        * 安全区域左侧插入位置
        */
      left: number;
      /**
        * 安全区域右侧插入位置
        */
      right: number;
      /**
        * 安全区顶部插入位置
        */
      top: number;
      /**
        * 安全区域底部插入位置
        */
      bottom: number;
  }
}
type UniInfo = {
  /**
   * uni 运行时版本
   */
  ur: string
  /**
   * uni 编译器版本号
   */
  uc: string
  /**
   * uni-app 运行平台
   */
  up: string
}
type HostInfo = {
  /**
   * App、小程序宿主版本
   */
  hv: string
  /**
   * 用户字体大小设置
   */
  hfs: string
  /**
   * 客户端基础库版本
   */
  hsdk: string
}
export type DeviceInfo = DeviceCommon & DeviceScreen & UniInfo & HostInfo
export function getAppDevice(deviceId: string) {
  return request<DeviceInfo>({
    url: `/device/${deviceId}`,
  })
}

export function getDeviceList(params: { page: number, size: number, timerange?: string[]}) {
  const _params = new Query(params).build()
  return request({
    url: '/device',
    params: _params,
    raw: 'data',
  })
}

export function getLogList(params: { page: number, size: number, timerange?: string[] }) {
  const _params = new Query(params).build()
  return request({
    url: '/record/logs',
    params: _params,
    raw: 'data',
  })
}
