import { COLLECT_API, OPERATION_TRACK } from '@/constant'
import pako from 'pako'

self.onmessage = (evt) => {
  switch (evt.data.type) {
    case 'report': {
      const { store, appid, sessionid, deviceid, keepalive } = evt.data
      const data = store.map((item: any) => ({ ...item, appid })).sort((a: any, b: any) => a.stamp - b.stamp)
      if (!data.length) return

      const [other, api, tracks] = sliceDataForKeepalive(data)
      if (keepalive) {
        // 为了保证页面关闭后数据尽可能被上报，需要对数据进行分割
        other.length > 0 && degradationReport({ appid, data: other }, true)
        api.length > 0 && degradationReport({ appid, data: api }, true)
        // rrweb的优先级最低
        tracks.length > 0 && degradationReport({ sessionid, deviceid, appid, data: tracks }, true, 'gzip')
      } else {
        const common = [...other, ...api]
        common.length > 0 && degradationReport({ appid, data: common }, false).catch((err) => {
          console.warn(err)
          self.postMessage('exception')
          self.close()
        }).finally(() => {
          self.postMessage('finish')
        })
        tracks.length > 0 && degradationReport({ sessionid, deviceid, appid, data: tracks }, false, 'gzip').catch((err) => {
          console.warn(err)
          self.postMessage('exception')
          self.close()
        }).finally(() => {
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
  return [otherSlices, apiSlices, trackSlices]
}

function degradationReport(body: any, keepalive: boolean, type: 'json' | 'gzip' = 'json') {
  let out: any
  switch (type) {
    case 'json': {
      out = body
      break
    }
    case 'gzip': {
      // 按sessionid + | + rrweb 进行数据组装
      const { sessionid, data, appid } = body
      const gzipData = pako.gzip(JSON.stringify(data))
      const encoder = new TextEncoder()
      const str = `${sessionid}:${appid}|`
      const protocolBytes = encoder.encode(str)
      out = new Uint8Array(gzipData.length + protocolBytes.length + 1)
      out.set(0)
      out.set(protocolBytes, 1)
      out.set(gzipData, protocolBytes.length + 1)
      break
    }
  }

  return self.fetch('BR_URL', {
    method: 'post',
    mode: 'no-cors',
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
    },
    cache: 'no-store',
    credentials: 'omit',
    priority: 'low',
    keepalive,
    body: out,
  })
}

// function getStrSize(str: string) {
//   const bytes = new TextEncoder().encode(str).length
//   return bytes
// }
