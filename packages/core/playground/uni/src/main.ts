import { createSSRApp } from 'vue'
// import ReportSDK from '@sepveneto/report-core/mp'
import App from './App.vue'

// const sdk = new ReportSDK({
//   url: 'http://localhost:5174/record',
//   appid: '65dff60ff2a68ca3dc989de4',
//   collect: true,
//   interval: 5,
//   error: true,
//   report: true,
//   network: {
//     enable: true,
//     success: true,
//     fail: true,
//     responseLimit: 100,
//   },
// })
// report('test', {mock: mockBody()})

// eval('a??.a')

function mockBody() {
  const n = 64 * 1024 + 1
  const data = new Array(n + 1).join('X')
  return data
}
// const a = undefined
// a.test
export function createApp() {
  const app = createSSRApp(App)
  return {
    app,
  }
}
