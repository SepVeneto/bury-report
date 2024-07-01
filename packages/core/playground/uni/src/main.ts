import { createSSRApp } from 'vue'
import { report } from '@sepveneto/report-core'
import App from './App.vue'
report('test', {mock: mockBody()})

function mockBody() {
  const n = 64 * 1024 + 1;
  const data = new Array(n+1).join('X');
  return data
}

export function createApp() {
  const app = createSSRApp(App)
  return {
    app,
  }
}
