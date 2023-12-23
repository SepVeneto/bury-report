import type { App } from 'vue'
import rxAuth from "./auth";
import rxSwitch from "./switch";

const comps = [
  rxAuth,
  rxSwitch,
]

function install(app: App) {
  comps.forEach(comp => {
    app.use(comp)
  })
}

export default {
  install,
}
