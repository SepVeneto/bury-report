import type { Options } from '@/type'
import { ErrorPlugin } from './plugins/error'

function init(options: Options) {
  try {
    const plugin = new ErrorPlugin()
    plugin.init(options.appid)

    Promise.allSettled([
      loadScript(options.url),
      options.operationRecord?.enable && loadScript(options.url, 'plugins/operationRecord.global.js'),
    ]).then(() => {
      plugin.resetListener()

      if ('BuryReport' in window) {
        if ('OperationRecordPlugin' in window) {
          window.BuryReport.registerPlugin(new window.OperationRecordPlugin())
        }
        // eslint-disable-next-line no-new
        new window.BuryReport(options)
      } else {
        console.warn('[@sepveneto/report-core] cannot find BuryReport  in window, maybe the core script is not loaded correctly')
      }
    })
  } catch (error) {
    console.warn('[@sepveneto/report-core] init failed with error', error)
  }
}

const version = process.env.DEFINE_VERSION
function loadScript(reportUrl: string, entry = 'index.global.js') {
  const script = document.createElement('script')
  const [major, minor] = version?.split('.') || []
  const versionPefix = `${major}.${minor}`
  const url = new URL(reportUrl)
  const coreUrl = `${url.origin}/sdk/${versionPefix}/${entry}?v=${version}`
  script.src = process.env.LOG_DEBUG ? `/public/${entry}` : coreUrl
  // script.src = `/public/${entry}`
  script.crossOrigin = 'anonymous'
  return new Promise((resolve, reject) => {
    script.onload = resolve
    script.onerror = reject
    document.body.appendChild(script)
  })
}

if (!Promise.allSettled) {
  Promise.allSettled = allSettledPolyfill
}

// @ts-expect-error: replace
init(SDK_OPTIONS)

// 1. 定义返回值的类型结构
interface PromiseFulfilledResult<T> {
  status: 'fulfilled';
  value: T;
}

interface PromiseRejectedResult {
  status: 'rejected';
  reason: any;
}

type PromiseSettledResult<T> = PromiseFulfilledResult<T> | PromiseRejectedResult

// 2. 实现 Polyfill
function allSettledPolyfill<T extends readonly unknown[] | []>(
  promises: T,
): Promise<{ [K in keyof T]: PromiseSettledResult<Awaited<T[K]>> }> {
  const ps = Array.from(promises)

  return new Promise((resolve) => {
    const results: any[] = []
    let completedCount = 0

    if (ps.length === 0) {
      return resolve([] as any)
    }

    ps.forEach((p, index) => {
      // Promise.resolve(p) 处理混合类型（Promise 或具体值）
      Promise.resolve(p)
        .then((value) => {
          results[index] = {
            status: 'fulfilled',
            value,
          }
        })
        .catch((reason) => {
          results[index] = {
            status: 'rejected',
            reason,
          }
        })
        .finally(() => {
          completedCount++
          if (completedCount === ps.length) {
            resolve(results as any)
          }
        })
    })
  })
}
