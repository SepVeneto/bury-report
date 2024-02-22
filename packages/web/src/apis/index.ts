import { request } from '@/util/request'
import type { Route } from '@/store'
import type { App } from './app'
// import '@/mock'

export * from './app'
export * from './project'

export async function getMenuList() {
  return Promise.resolve({
    list: [
      {
        id: 3,
        name: '项目列表',
        path: 'projects',
        route: 'ProjectList',
      },
      {
        id: 2,
        name: '应用列表',
        path: 'apps',
        route: 'AppList',
        children: [
          {
            id: 3,
            name: '应用详情',
            path: ':id',
            route: 'AppDetail',
            hidden: true,
          },
        ],
      },
    ],
  })
}

export function getModList(): Promise<Route[]> {
  return Promise.resolve([
    {
      id: 1,
      name: '项目管理',
      path: '/manage/:page*',
      route: 'App',
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
