import axios from 'axios'
// document.getElementById('app')!.innerHTML = '__UNPLUGIN__'

window.fetch = undefined
// setTimeout(() => {
axios.get('/api/captcha', { params: { name: 'test' }, headers: { token: 'token' }, responseType: 'json' })
// }, 1.5 * 1000)
