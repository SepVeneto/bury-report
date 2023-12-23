<template>
  <div>Loading...</div>
</template>

<script lang="ts" setup>
import LayoutView from '@/layout/AppView.vue'
import AppView from '@/views/AppView.vue'
import { useApp } from '@/store'
import type { Route } from '@/store'
import Topbar from '@/layout/topbar'
import { useRoute, useRouter } from 'vue-router'
import { getMenuList, getModList } from '@/apis'
import type { RouteRecordRaw } from 'vue-router'
import { content } from '@/router'
import { walkRoute } from '@/util/tools'

const router = useRouter()
const route = useRoute()
const store = useApp()

let MOD: number | undefined
if (store.isMicroApp()) {
  const data = window.microApp!.getData()
  if (!data) throw new Error('Failed to read data from micro app')

  MOD = data.modId as number
}

initMenu()

async function initMenu() {
  let menuList
  if (store.isMicroApp()) {
    menuList = (await getMenuList(MOD!)).list
    store.menuList = menuList
  } else {
    const mods = await getModList()
    menuList = mods
    store.modList = mods
  }

  walkRoute<Route[]>(menuList, (menu, _depth, parent) => {
    let defaultComp: any = LayoutView
    if (parent) {
      const comp = content[menu.route as keyof typeof content]
      if (!comp) {
        console.warn(`Can not find router view ${menu.route}`)
      }
      defaultComp = comp
    }
    const newRoute: RouteRecordRaw = {
      name: menu.route,
      path: menu.path,
      props: {},
      components: {
        topbar: Topbar,
        default: defaultComp,
      },
    }
    if (store.isBaseApp()) {
      const defaultPath = route.query[menu.route]
      newRoute.props = {
        default: {
          modId: menu.id,
          url: localStorage.getItem(menu.route) || `${location.origin + menu.path}`,
          defaultPath,
        },
      }
      newRoute.components.default = AppView
    }
    if (store.isSpaApp()) {
      newRoute.props = {
        default: {
          modId: menu.id,
        },
      }
    }
    parent ? router.addRoute(parent.route, newRoute) : router.addRoute(newRoute)

    return Array.isArray(menu.children) ? menu.children : true
  })

  router.removeRoute('RedirectView')
  await router.isReady()
  router.replace(route.path === '/' ? { name: menuList[0].route } : route.path)
}

// const menuList = computed(() => store.getMenusByMod(store.modId as any))
// menuList.value.forEach(menu => {
//   router.addRoute(store.modId!, {
//     name: menu.route,
//     path: menu.path,
//     component: () => import('@/views/demo.vue'),
//   })
// })
</script>
