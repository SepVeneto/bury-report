import { defineStore } from 'pinia'
import { ref, shallowRef } from 'vue'
import type { RouteLocationNormalized } from 'vue-router'

export type Route = {
  id: number
  name: string
  path: string
  route: string
  hidden?: boolean
  children?: Route[]
}

export const useApp = defineStore('app', () => {
  const username = 'anonymous'
  const title = import.meta.env.VITE_APP_TITLE

  const menuList = shallowRef<Route[]>([])
  const modList = shallowRef<Route[]>([])
  const appid = ref()

  const mode: 'spa' | 'base' = 'spa'

  function isMicroApp() {
    return window.__MICRO_APP_ENVIRONMENT__
  }
  function isBaseApp() {
    return mode === 'base'
  }
  function isSpaApp() {
    return !isMicroApp() && !isBaseApp()
  }

  return {
    appid,
    username,
    title,
    breadcrumb: [] as RouteLocationNormalized[],
    menuList,
    modList,

    isSpaApp,
    isMicroApp,
    isBaseApp,
  }
})
