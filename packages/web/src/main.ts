import { createApp } from 'vue'
import App from './App.vue'
import BasicComp from '@sepveneto/basic-comp'
import ElementPlus from 'element-plus'
import router from './router'
import { createPinia } from 'pinia'
import zhCn from 'element-plus/es/locale/lang/zh-cn'
import comps from './components'
import microApp from '@micro-zoe/micro-app'

import 'element-plus/theme-chalk/index.css'
import '@sepveneto/basic-comp/theme-chalk/index.css'
import './style/index.css'

const app = createApp(App)
app.use(createPinia())
app.use(ElementPlus, {
  locale: zhCn,
})
app.use(BasicComp, {})
app.use(comps)
app.use(router)
app.mount('#app')

import.meta.env.VITE_APP_BASE && microApp.start()
