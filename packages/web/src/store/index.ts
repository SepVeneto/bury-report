import { defineStore } from 'pinia'
import { computed, ref, shallowRef } from 'vue'
import type { RouteLocationNormalized } from 'vue-router'
import type { Account } from '@/apis/account'

export type Route = {
  id: number
  name: string
  path: string
  route: string
  hidden?: boolean
  children?: Route[]
}

export const useApp = defineStore('app', () => {
  const title = import.meta.env.PUBLIC_TITLE
  const account = ref<Account | null>(readAccount())
  const username = computed(() => account.value?.name || 'anonymous')
  const role = computed(() => account.value?.role || '')
  const accountId = computed(() => account.value?.id || '')

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

  function setAccount(value: Account) {
    account.value = value
    localStorage.setItem('account', JSON.stringify(value))
  }

  return {
    appid,
    account,
    username,
    role,
    accountId,
    title,
    breadcrumb: [] as RouteLocationNormalized[],
    menuList,
    modList,

    isSpaApp,
    isMicroApp,
    isBaseApp,
    setAccount,
  }
})

function readAccount(): Account | null {
  try {
    const value = localStorage.getItem('account')
    return value ? JSON.parse(value) as Account : null
  } catch {
    localStorage.removeItem('account')
    return null
  }
}
