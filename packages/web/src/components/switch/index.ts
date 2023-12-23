import type { App, Plugin } from 'vue'
import Switch from "./rxSwitch.vue";

Switch.install = (app: App) => {
  app.component(Switch.name, Switch)
}

const _Switch = Switch as unknown as Plugin

export default _Switch;
