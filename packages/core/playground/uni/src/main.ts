import { createSSRApp } from 'vue'
import { report } from '@sepveneto/report-core'
import App from './App.vue'
report('test', {})
export function createApp() {
  const app = createSSRApp(App)
  return {
    app,
  }
}
