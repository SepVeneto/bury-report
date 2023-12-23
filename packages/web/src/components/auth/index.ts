import type { App, Plugin } from 'vue'
import Auth from "./rxAuth.vue";

Auth.install = (app: App) => {
  app.component(Auth.name, Auth)
}

const _Auth = Auth as unknown as Plugin

export default _Auth
