import axios from 'axios'
// document.getElementById('app')!.innerHTML = '__UNPLUGIN__'

// setTimeout(() => {
axios.get('/api/captcha', { params: { name: 'test' }, headers: { token: 'token' }, responseType: 'json' })
setTimeout(() => {
  axios.get('/api/captcha', { params: { name: 'test' }, headers: { token: 'token' }, responseType: 'json' })
}, 5 * 1000)

setTimeout(() => {
  axios.get('/api/captcha', { params: { name: 'test' }, headers: { token: 'token' }, responseType: 'json' })
}, 10 * 1000)
// }, 1.5 * 1000)
