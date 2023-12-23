import { request } from '@/util/request'
import type { Route } from '@/store'
import '@/mock'

export async function getMenuList(modId: number) {
  const res = await request<{ list: Route[] }>({
    url: '/menu',
    params: {
      modId,
    },
  })
  return res
}

export function getModList() {
  return request<Route[]>({
    url: '/mod',
  })
}
