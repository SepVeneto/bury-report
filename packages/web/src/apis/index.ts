import { serverRequest as request } from '@/util/request'
import type { Route } from '@/store'
import type { App } from './app'
// import '@/mock'

export * from './app'
export * from './project'
export * as source from './source'
export * as statistics from './statistics'

export class Query {
  private query: Record<string, any> = {}
  constructor(filter: Record<string, any>) {
    Object.entries(filter).forEach(([key, val]) => {
      if (Array.isArray(val)) {
        const [start, end] = val
        this.query[`start_${key}`] = start
        this.query[`end_${key}`] = end
      } else {
        this.query[key] = val
      }
    })
  }

  build() {
    return this.query
  }
}

const mockMenus = [
  {
    pid: 2,
    id: 3,
    name: '图表管理',
    path: '',
    route: 'ChartsView',
  },
  {
    pid: 3,
    id: 31,
    name: '数据源',
    path: 'source',
    route: 'SourceView',
  },
  {
    pid: 3,
    id: 35,
    name: '上报日志',
    path: 'log',
    route: 'LogView',
  },
  {
    pid: 3,
    id: 32,
    name: '错误记录',
    path: 'error',
    route: 'ErrorView',
  },
  {
    pid: 3,
    id: 34,
    name: '网络请求',
    path: 'network',
    route: 'NetworkView',
  },
  {
    pid: 3,
    id: 33,
    name: '历史设备',
    path: 'device',
    route: 'DeviceView',
    children: [{
      pid: 33,
      id: 331,
      name: '设备详情',
      route: 'DeviceDetail',
      path: 'detail/:id',
      hidden: true,
    }],
  },
  // {
  //   pid: 2,
  //   id: 2,
  //   name: '应用列表',
  //   path: 'apps',
  //   route: 'AppList',
  //   children: [
  //     {
  //       id: 3,
  //       name: '应用详情',
  //       path: ':id',
  //       route: 'AppDetail',
  //       hidden: true,
  //     },
  //   ],
  // },
  {
    pid: 1,
    id: 11,
    name: '首页',
    path: '',
    route: 'DashboardView',
  },
]
export async function getMenuList(modId: number) {
  return Promise.resolve({
    list: mockMenus.filter(menu => menu.pid === modId),
  })
}

export function getModList(): Promise<Route[]> {
  return Promise.resolve([
    {
      id: 1,
      name: '首页',
      path: '/:appid/:page*',
      route: 'Dashboard',
    },
    {
      id: 3,
      name: '应用管理',
      path: '/:appid/manage/:page*',
      route: 'Manage',
    },
    {
      id: 2,
      name: '数据统计',
      path: '/:appid/statistics/:page*',
      route: 'Statistics',
    },
  ])
}

export function getCaptcha() {
  return request<{ background: string, block: string, key: string }>({
    url: '/captcha',
    method: 'get',
  })
}

export function login(data: { name: string, password: string, key: string, offset: number }) {
  return request<{ token: string }>({
    url: '/login',
    method: 'POST',
    data,
  })
}
export type PortalInst = {
  type: 'project' | 'app'
  id: string
  name: string
  apps?: App[]
}
export function getPortal() {
  return request<PortalInst[]>({
    url: '/portal',
  })
}
