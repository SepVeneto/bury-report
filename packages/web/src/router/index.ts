import { createRouter, createWebHashHistory } from 'vue-router'
import type { RouteRecordRaw } from 'vue-router'
// import subView from '@/layout/subView.vue'
import { useApp } from '@/store'
import RedirectView from '@/layout/RedirectView.vue'
import NotFound from '@/layout/NotFound.vue'

const routes: RouteRecordRaw[] = [
  {
    path: '/',
    name: 'Portal',
    component: () => import('@/views/portal/indexView.vue'),
  },
  {
    path: '/:pathMatch(.*)*',
    name: 'RedirectView',
    component: RedirectView,
  },
  {
    path: '/:pathMatch(.*)*',
    name: 'NotFound',
    component: NotFound,
  },
  {
    path: '/login',
    name: 'Login',
    component: () => import('@/views/LoginView.vue'),
  },
]

const router = createRouter({
  routes,
  history: createWebHashHistory(),
})

router.beforeResolve((to) => {
  const appStore = useApp()
  // 面包屑
  const breadcrumb = appStore.breadcrumb
  const index = breadcrumb.findIndex(item => item.name === to.name)
  index > -1 && breadcrumb.splice(index, breadcrumb.length - index)
  // const token = localStorage.getItem('token')
  const matched = [...to.matched]
  if (matched.length > 0) {
    const componentName = matched.slice(-1)[0].components?.default?.name ?? ''
    if (!componentName) {
      console.warn(`[${to.meta.title}]无法缓存，请检查组件名称是否存在。如果不需要缓存可以忽略。`)
    } else {
      to.meta.componentName = componentName
    }
  }
  appStore.breadcrumb.push(to)
})
router.beforeEach(to => {
  if (['Login'].includes(to.name as string)) {
    return
  }
  const token = localStorage.getItem('token')
  if (!token) {
    return { name: 'Login' }
  }
})

export default router

export * from './content'
