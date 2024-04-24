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
    /**
     * TODO: normalize variable
     */
    const [, side, subSide] = route.matched.length < 4 ? [null, ...route.matched] : route.matched
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

  addRoute(mod.value).then(() => {
    const isFirstMenu = route.matched[0].path.startsWith(route.path)
    router.replace(isFirstMenu ? { name: 'Portal' } : route.path)
  })

  function normalizeRoute(menu: Route, depth = 0): RouteRecordRaw {
    if (menu.children) {
      const _menu: RouteRecordRaw = {
        name: menu.route,
        path: menu.path,
        meta: { title: menu.name, hidden: !!menu.hidden },
        children: [],
      }
      /**
       * TODO: normalize depth
       */
      if (depth >= 0) {
        delete _menu.name
        _menu.children = [{
          path: '',
          name: menu.route,
          component: (content as Record<string, any>)[menu.route],
        }]
      } else {
        const redirectRoute = menu.children.find(item => !item.hidden)
        redirectRoute && (_menu.redirect = { name: redirectRoute.route })
      }
      _menu.children.push(...menu.children.map((child: Route) => normalizeRoute(child, depth + 1)))
      return _menu
    } else {
      const _menu: RouteRecordRaw = {
        name: menu.route,
        path: menu.path,
        meta: { title: menu.name, hidden: !!menu.hidden },
        component: (content as Record<string, any>)[menu.route],
      }
      return _menu
    }
  }

  async function addRoute(mod: number) {
    console.log(mod)
    const menuList = (await getMenuList(mod)).list
    store.menuList = menuList

    console.log(menuList)
    const modName = store.modList.find(item => item.id === mod)?.route || ''
    menuList.forEach(menu => {
      router.addRoute(modName, normalizeRoute(menu))
    })
    await router.isReady()
    return menuList
  }
  return [activeMenu, activeSubMenu]
}
