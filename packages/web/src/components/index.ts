import type { App } from 'vue'
import rxAuth from './auth'
import rxSwitch from './switch'
import PageLayout from './PageLayout.vue'

const comps = [
  rxAuth,
  rxSwitch,
]

function install(app: App) {
  app.component('PageLayout', PageLayout)
  comps.forEach(comp => {
    app.use(comp)
  })
}

export default {
  install,
}
