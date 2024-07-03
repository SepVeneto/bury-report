import http from 'http'

const server = http.createServer((req, res) => {
  res.statusCode = 500
  res.end('500 error\n')
})

server.listen(7777, '127.0.0.1', () => {
  console.log('listening on 7777')
})
