import { content } from '@/router'
import { useRoute, useRouter } from 'vue-router'
import type { Route } from '@/store'
import type { Ref } from 'vue'
import { ref, watch, watchEffect } from 'vue'
import { useApp } from '@/store'
import type { RouteRecordRaw } from 'vue-router'
import { getMenuList } from '@/apis'

export function useMenu(mod: Ref<number>) {
  const router = useRouter()
  const route = useRoute()
  const activeMenu = ref('')
  const activeSubMenu = ref('')
  const store = useApp()

  watchEffect(() => {
    // 针对只有一级菜单的情况，对匹配路由进行标准化，抹平解构差异
    console.log(route.matched)
    const [, side, subSide] = route.matched.length < 3 ? [null, ...route.matched] : route.matched
    console.log(route.matched)
    if (!side || !subSide) return
    activeMenu.value = side.name as string
    activeSubMenu.value = (subSide.children[0] ? subSide.children[0].name : subSide.name) as string
  })

  watch(mod, (val) => {
    addRoute(val).then(menus => {
      const isFirstMenu = route.matched[0].path.startsWith(route.path)
      router.replace(isFirstMenu ? { name: menus[0].route } : route.path)
    })
  })

  addRoute(mod.value).then((menus) => {
    const isFirstMenu = route.matched[0].path.startsWith(route.path)
    router.replace(isFirstMenu ? { name: menus[0].route } : route.path)
  })

  function normalizeRoute(menu: Route, depth = 0): RouteRecordRaw {
  if (menu.children) {
    const _menu: RouteRecordRaw = {
      name: menu.route,
      path: menu.path,
      meta: { title: menu.name },
      children: [],
    }
    if (depth > 0) {
      delete _menu.name
      _menu.children = [{
        path: '',
        name: menu.route,
        component: (content as Record<string, any>)[menu.route],
      }]
    } else {
      _menu.redirect = { name: menu.children[0].route }
    }
    _menu.children.push(...menu.children.map((child: Route) => normalizeRoute(child, depth + 1)))
    return _menu
  } else {
    const _menu: RouteRecordRaw = {
      name: menu.route,
      path: menu.path,
      meta: { title: menu.name },
      component: (content as Record<string, any>)[menu.route],
    }
    return _menu
  }
}

  async function addRoute(mod: number) {
    const menuList = (await getMenuList(mod)).list
    store.menuList = menuList

    const modName = store.modList.find(item => item.id === mod)!.route
    menuList.forEach(menu => {
      router.addRoute(modName, normalizeRoute(menu))
    })
    await router.isReady()
    return menuList
  }
  return [activeMenu, activeSubMenu]
}