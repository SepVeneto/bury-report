import { COLLECT_API, OPERATION_TRACK } from '@/constant'
import pako from 'pako'

self.onmessage = (evt) => {
  switch (evt.data.type) {
    case 'report': {
      const { store, cache, appid, keepalive } = evt.data
      const data = [...store, ...cache].map(item => ({ ...item, appid })).sort((a: any, b: any) => a.stamp - b.stamp)
      if (!data.length) return

      if (keepalive) {
        const parts = sliceDataForKeepalive(data)
        parts.forEach(item => {
          degradationReport({ appid, data: item })
        })
      } else {
        degradationReport({ appid, data }).finally(() => {
          self.postMessage('finish')
        })
      }
      break
    }
    default:
      console.warn('[@sepveneto/report-core] invalid event type: ' + evt.data.type)
  }
}

function sliceDataForKeepalive(data: any[]) {
  const trackSlices = []
  const apiSlices = []
  const otherSlices = []

  for (const item of data) {
    switch (item.type) {
      case OPERATION_TRACK:
        trackSlices.push(item)
        break
      case COLLECT_API:
        apiSlices.push(item)
        break
      default:
        otherSlices.push(item)
        break
    }
  }
  return [otherSlices, trackSlices, apiSlices]
}

function degradationReport(body: any) {
  const str = JSON.stringify(body)
  // const strSize = getStrSize(str)
  // console.log('origin', strSize)
  const data = pako.gzip(str)
  const out = new Uint8Array(data.length + 1)
  // 标记为gzip数据
  out[0] = 1
  out.set(data, 1)

  return self.fetch('BR_URL', {
    method: 'post',
    mode: 'no-cors',
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
    },
    cache: 'no-store',
    credentials: 'omit',
    priority: 'low',
    body: out,
  })
}

// function getStrSize(str: string) {
//   const bytes = new TextEncoder().encode(str).length
//   return bytes
// }
