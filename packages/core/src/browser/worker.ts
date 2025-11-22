import pako from 'pako'

self.onmessage = (evt) => {
  switch (evt.data.type) {
    case 'report': {
      const { store, cache, appid } = evt.data
      const data = [...store, ...cache].map(item => ({ ...item, appid })).sort((a: any, b: any) => a.stamp - b.stamp)
      degradationReport({ appid, data }).finally(() => {
        self.postMessage('finish')
      })
      break
    }
    default:
      console.warn('[@sepveneto/report-core] invalid event type: ' + evt.data.type)
  }
}

function degradationReport(body: any) {
  const str = JSON.stringify(body)
  const strSize = getStrSize(str)
  console.log('origin', strSize)
  const data = pako.gzip(str)
  const out = new Uint8Array(data.length + 1)
  // 标记为gzip数据
  out[0] = 1
  out.set(data, 1)
  console.log('gzip', out.length)
  console.log('rate', ((1 - out.length / strSize) * 100).toFixed(2) + '%')

  return self.fetch('BR_URL', {
    method: 'post',
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
    },
    cache: 'no-store',
    credentials: 'omit',
    signal: AbortSignal.timeout(3000),
    priority: 'low',
    body: out,
    // body: str,
  })
}

function getStrSize(str: string) {
  const bytes = new TextEncoder().encode(str).length
  return bytes
}
