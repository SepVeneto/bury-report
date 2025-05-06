import axios from 'axios'
const node = document.createElement('div')
node.innerHTML = 'test'
document.body.appendChild(node)
// document.getElementById('app')!.innerHTML = '__UNPLUGIN__'

// setTimeout(() => {
axios.get('/api', { params: { name: 'test' }, headers: { token: 'token' }, responseType: 'json' })
axios.post('/api', { mock: mockBody() })
axios.post('/api', { mock: mockBody() })

// }, 1.5 * 1000)

function mockBody() {
  const n = 64 * 1024 + 1;
  const data = new Array(n+1).join('X');
  return data
}
