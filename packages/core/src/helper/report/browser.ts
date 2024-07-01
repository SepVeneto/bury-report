import type { Options } from '@/type'
import { REPORT_QUEUE, REPORT_REQUEST } from '@/utils/constant'
import { getLocalStorage, setLocalStorage } from '@/utils/storage'

let timer: number | undefined

const workerStr = `
self.onmessage = (evt) => {
  switch (evt.data.type) {
    case 'report':
      degradationReport(evt.data.body).finally(() => {
        self.postMessage('finish')
      })
      break
    default:
      console.warn('[@sepveneto/report-core] invalid event type: ' + evt.data.type)
  }
}

function degradationReport(body) {
  return self.fetch('BR_URL', {
    method: 'post',
    mode: 'no-cors',
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
    },
    cache: 'no-store',
    credentials: 'omit',
    priority: 'low',
    body,
  })
}
`

export function __BR_REPORT_INIT__(
  appid: Options['appid'],
  url: Options['url'],
  interval: Required<Options>['interval'],
) {
  globalThis[REPORT_REQUEST] = function (
    uuid: string,
    type: string,
    data: Record<string, any>,
    immediate = false,
  ) {
    const list = JSON.parse(getLocalStorage(REPORT_QUEUE) || '[]')
    list.push({ uuid, type, data, appid, time: new Date().toLocaleString() })
    setLocalStorage(REPORT_QUEUE, JSON.stringify(list))

    const sendRequest = () => {
      const list = JSON.parse(getLocalStorage(REPORT_QUEUE) || '[]')
      const body = JSON.stringify({ appid, data: list })

      // 按照sendBeacon的实现标准，不同浏览器可能会有不同的大小限制
      // 以Chrome为例，是队列加总计64KB
      // 以Firefox为例，则是没有限制
      // 当上报请求被浏览器拦截后自动降级为Fetch
      // 为了不影响主线程，临时创建一个worker去发送大数据，用完立即销毁
      const isSend = window.navigator.sendBeacon(url, body)
      if (!isSend) {
        const blob = new Blob([workerStr.replace('BR_URL', url)], { type: 'application/javascript' })
        const workerUrl = window.URL.createObjectURL(blob)
        window.__BR_WORKER__ = new window.Worker(workerUrl)
        window.__BR_WORKER__.onmessage = () => {
          window.__BR_WORKER__?.terminate()
          delete window.__BR_WORKER__
        }
        window.__BR_WORKER__.postMessage({ type: 'report', body })
      }

      // 不管上报的成功与否，都需要清除定时器，保证新的上报流程正常执行
      // 都需要把上报队列清空，防止过度使用用户缓存
      setLocalStorage(REPORT_QUEUE, JSON.stringify([]))
      clearInterval(timer)
      timer = undefined
    }

    if (immediate) {
      sendRequest()
      return
    }

    if (!timer) {
      timer = (globalThis.setTimeout(sendRequest, interval * 1000)) as unknown as number
    }
  }
}
